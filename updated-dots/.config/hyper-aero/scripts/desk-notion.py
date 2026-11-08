#!/usr/bin/env python3
"""Notion notes for the desk calendar, ported from the AGS state/notion.ts.

    desk-notion.py FROM TO
    desk-notion.py FROM TO add DATE TEXT
    desk-notion.py FROM TO done PAGE_ID 0|1
    desk-notion.py FROM TO delete PAGE_ID

Every call prints one JSON line: the notes between FROM and TO after the action,
plus the read-only events from the iCal addresses in desk/calendars.json.
"""

import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

CONFIG = os.path.expanduser("~/.config/hyper-aero/desk/notion.json")
CALENDARS = os.path.expanduser("~/.config/hyper-aero/desk/calendars.json")
CACHE = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
CACHE_AGE = 300
API = "https://api.notion.com/v1"
# 2025-09-03 moved queries from databases to data sources; this wants a flat list.
NOTION_VERSION = "2022-06-28"
TIMEOUT = 15


def database_id(raw):
    # ?v= in a database URL is the view id, also 32 hex digits, so drop it first
    path = raw.strip().split("?")[0].replace("-", "")
    found = re.findall(r"[0-9a-f]{32}", path, re.I)
    return found[-1].lower() if found else path


def load_config():
    try:
        with open(CONFIG) as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(cfg, dict) or not cfg.get("token") or not cfg.get("databaseId"):
        return None
    return {"token": str(cfg["token"]).strip(), "db": database_id(str(cfg["databaseId"]))}


def call(cfg, path, method="GET", body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={
            "Authorization": "Bearer " + cfg["token"],
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.load(res)
    except urllib.error.HTTPError as err:
        # Notion's message names the property or permission that is wrong
        try:
            message = json.load(err).get("message")
        except ValueError:
            message = None
        raise RuntimeError(message or "HTTP %d" % err.code)


def discover(cfg):
    # property names are the user's own, so look them up by type
    props = call(cfg, "/databases/" + cfg["db"]).get("properties", {})

    def by_type(kind):
        return next((k for k, p in props.items() if p.get("type") == kind), None)

    title = by_type("title")
    if not title:
        raise RuntimeError("database has no title property")
    return {"title": title, "date": by_type("date"), "done": by_type("checkbox")}


def plain(prop):
    parts = (prop or {}).get("title") or (prop or {}).get("rich_text") or []
    return "".join(p.get("plain_text", "") for p in parts).strip()


def query(cfg, schema, start, end):
    body = {"page_size": 100}
    if schema["date"]:
        body["sorts"] = [{"property": schema["date"], "direction": "ascending"}]
        body["filter"] = {
            "and": [
                {"property": schema["date"], "date": {"on_or_after": start}},
                {"property": schema["date"], "date": {"on_or_before": end}},
            ]
        }
    page = call(cfg, "/databases/" + cfg["db"] + "/query", "POST", body)

    notes = []
    for row in page.get("results", []):
        props = row.get("properties", {})
        date = (props.get(schema["date"], {}).get("date") or {}).get("start", "")
        notes.append({
            "id": row["id"],
            "text": plain(props.get(schema["title"])),
            "date": date[:10],
            "done": bool(schema["done"] and props.get(schema["done"], {}).get("checkbox")),
        })
    return notes


def act(cfg, schema, action):
    verb = action[0]
    if verb == "add":
        date, text = action[1], action[2].strip()
        if not text:
            return
        props = {schema["title"]: {"title": [{"text": {"content": text}}]}}
        if schema["date"]:
            props[schema["date"]] = {"date": {"start": date}}
        if schema["done"]:
            props[schema["done"]] = {"checkbox": False}
        call(cfg, "/pages", "POST", {"parent": {"database_id": cfg["db"]}, "properties": props})
    elif verb == "done" and schema["done"]:
        checked = action[2] == "1"
        call(cfg, "/pages/" + action[1], "PATCH", {"properties": {schema["done"]: {"checkbox": checked}}})
    elif verb == "delete":
        # archived, not destroyed: it stays recoverable from Notion's trash
        call(cfg, "/pages/" + action[1], "PATCH", {"archived": True})


def run(args):
    cfg = load_config()
    if not cfg:
        return {"state": "unconfigured"}
    try:
        schema = discover(cfg)
        if len(args) > 2:
            act(cfg, schema, args[2:])
        return {
            "state": "ok",
            "hasDone": bool(schema["done"]),
            "notes": query(cfg, schema, args[0], args[1]),
        }
    except Exception as err:
        return {"state": "error", "detail": str(err)}


def ical_text(url):
    # the widget polls and every note action calls this, so don't refetch each time
    path = "%s/aero-cal-%s.ics" % (CACHE, hashlib.sha1(url.encode()).hexdigest()[:16])
    fresh = os.path.exists(path) and time.time() - os.path.getmtime(path) < CACHE_AGE
    if not fresh:
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT) as res:
                text = res.read().decode("utf-8", "replace")
            if "BEGIN:VCALENDAR" not in text:
                raise RuntimeError("not an iCal address")
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(text)
            return text
        except Exception:
            if not os.path.exists(path):
                raise
    with open(path) as f:
        return f.read()


def ical_events(text):
    lines = re.sub(r"\r?\n[ \t]", "", text).splitlines()
    out, cur = [], None
    for line in lines:
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT":
            out.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            head, value = line.split(":", 1)
            name, *params = head.split(";")
            cur.setdefault(name, []).append((dict(p.split("=", 1) for p in params if "=" in p), value))
    return out


def stamp(params, value):
    """A date for all-day values, otherwise an aware datetime (naive if floating)."""
    if params.get("VALUE") == "DATE" or len(value) == 8:
        return dt.datetime.strptime(value[:8], "%Y%m%d").date()
    when = dt.datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
        return when.replace(tzinfo=dt.timezone.utc)
    return when.replace(tzinfo=ZoneInfo(params["TZID"])) if "TZID" in params else when


def local(when):
    if isinstance(when, dt.datetime) and when.tzinfo:
        return when.astimezone().replace(tzinfo=None)
    return when


def key(when):
    return when.isoformat() if isinstance(when, dt.date) and not isinstance(when, dt.datetime) else local(when).isoformat()


def unescape(value):
    return re.sub(r"\\([,;\\nN])", lambda m: " " if m[1] in "nN" else m[1], value).strip()


def occurrences(ev, first, last):
    from dateutil.rrule import rrulestr

    start = stamp(*ev["DTSTART"][0])
    if "RRULE" not in ev:
        return [start]

    allday = not isinstance(start, dt.datetime)
    origin = dt.datetime.combine(start, dt.time()) if allday else start
    aware = origin.tzinfo is not None
    rule = ev["RRULE"][0][1]
    # dateutil wants UNTIL to agree with DTSTART about having a timezone
    if aware:
        rule = re.sub(r"UNTIL=(\d{8})(?=;|$)", r"UNTIL=\1T235959Z", rule)
    else:
        rule = re.sub(r"UNTIL=(\d{8})T\d{6}Z?", r"UNTIL=\1T235959", rule)

    # a day of slack either side: the window is local, the rule may not be
    lo = dt.datetime.combine(first - dt.timedelta(days=1), dt.time())
    hi = dt.datetime.combine(last + dt.timedelta(days=2), dt.time())
    if aware:
        lo, hi = lo.replace(tzinfo=origin.tzinfo), hi.replace(tzinfo=origin.tzinfo)

    skip = {key(stamp(p, v)) for item in ev.get("EXDATE", []) for p, vs in [item] for v in vs.split(",")}
    found = [t.date() if allday else t for t in rrulestr(rule, dtstart=origin).between(lo, hi, inc=True)]
    return [t for t in found if key(t) not in skip]


def event_days(ev, start, first, last):
    allday = not isinstance(start, dt.datetime)
    begin = start if allday else local(start).date()
    length = dt.timedelta()
    if "DTEND" in ev:
        length = stamp(*ev["DTEND"][0]) - stamp(*ev["DTSTART"][0])
    # an all-day DTEND is exclusive, and a timed one ending at midnight is that day
    if allday:
        stop = begin + max(length, dt.timedelta(days=1)) - dt.timedelta(days=1)
    else:
        stop = (local(start) + max(length, dt.timedelta()) - dt.timedelta(seconds=1)).date()
        stop = max(stop, begin)
    day = max(begin, first)
    while day <= min(stop, last):
        yield day
        day += dt.timedelta(days=1)


def calendars(first, last):
    try:
        with open(CALENDARS) as f:
            urls = json.load(f).get("icals", [])
    except (OSError, ValueError):
        return {"events": [], "calState": "none"}

    first_d, last_d = dt.date.fromisoformat(first), dt.date.fromisoformat(last)
    events, failed = [], 0
    for url in urls:
        try:
            parsed = ical_events(ical_text(url))
            moved = {(e["UID"][0][1], key(stamp(*e["RECURRENCE-ID"][0]))) for e in parsed if "RECURRENCE-ID" in e and "UID" in e}
            for ev in parsed:
                if "DTSTART" not in ev or ev.get("STATUS", [({}, "")])[0][1] == "CANCELLED":
                    continue
                uid = ev.get("UID", [({}, "")])[0][1]
                for start in occurrences(ev, first_d, last_d):
                    if "RECURRENCE-ID" not in ev and (uid, key(start)) in moved:
                        continue
                    clock = local(start).strftime("%H:%M") if isinstance(start, dt.datetime) else ""
                    for day in event_days(ev, start, first_d, last_d):
                        events.append({
                            "id": "%s/%s" % (uid, day),
                            "text": unescape(ev.get("SUMMARY", [({}, "(no title)")])[0][1]),
                            "date": day.isoformat(),
                            "time": clock,
                            "done": False,
                            "readonly": True,
                        })
        except ImportError:
            return {"events": [], "calState": "error", "calDetail": "install python-dateutil"}
        except Exception as err:
            failed += 1
            sys.stderr.write("calendar: %s\n" % type(err).__name__)
    if failed:
        return {"events": events, "calState": "error", "calDetail": "%d calendar(s) failed" % failed}
    return {"events": events, "calState": "ok"}


if __name__ == "__main__":
    args = sys.argv[1:]
    print(json.dumps({**run(args), **calendars(args[0], args[1])}), flush=True)
