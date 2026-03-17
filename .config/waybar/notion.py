#!/usr/bin/env python3
"""
Notion calendar waybar module.
Shows today's events count + next event title.

Setup:
  1. Create a Notion integration at https://www.notion.so/my-integrations
  2. Share your calendar database with it
  3. Set env vars in ~/.config/waybar/notion.env:
       NOTION_TOKEN=secret_xxxx
       NOTION_DB_ID=your-database-id

The database should have:
  - A "Date" property (type: date)
  - A "Name" / title property
"""

import os
import json
import subprocess
from datetime import datetime, timezone

TOKEN = os.environ.get("NOTION_TOKEN", "")
DB_ID = os.environ.get("NOTION_DB_ID", "")

ICON        = "󰠮 "   # nerd font calendar
ICON_EVENT  = "󰃰 "


def load_env():
    env_file = os.path.expanduser("~/.config/waybar/notion.env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def query_today():
    today = datetime.now(timezone.utc).date().isoformat()
    payload = {
        "filter": {
            "property": "Publication Date",
            "date": {"equals": today}
        },
        "sorts": [{"property": "Publication Date", "direction": "ascending"}]
    }
    try:
        result = subprocess.check_output([
            "curl", "-s", "-X", "POST",
            f"https://api.notion.com/v1/databases/{DB_ID}/query",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Notion-Version: 2022-06-28",
            "-H", "Content-Type: application/json",
            "-d", json.dumps(payload)
        ], stderr=subprocess.DEVNULL)
        return json.loads(result)
    except Exception:
        return None


def main():
    load_env()
    global TOKEN, DB_ID
    TOKEN = os.environ.get("NOTION_TOKEN", "")
    DB_ID = os.environ.get("NOTION_DB_ID", "")

    if not TOKEN or not DB_ID:
        print(json.dumps({
            "text": ICON + "setup",
            "tooltip": "Set NOTION_TOKEN and NOTION_DB_ID in\n~/.config/waybar/notion.env",
            "class": "unconfigured"
        }))
        return

    data = query_today()
    if not data or "results" not in data:
        print(json.dumps({
            "text": ICON + "–",
            "tooltip": "Could not reach Notion API",
            "class": "error"
        }))
        return

    results = data["results"]
    count = len(results)

    if count == 0:
        print(json.dumps({
            "text": ICON + "free",
            "tooltip": "No events today",
            "class": "empty"
        }))
        return

    # Get title of first event
    first = results[0]
    try:
        title = first["properties"]["Name"]["title"][0]["plain_text"]
    except (KeyError, IndexError):
        title = "Event"

    tooltip_lines = [f"Today — {count} event{'s' if count > 1 else ''}"]
    for r in results:
        try:
            t = r["properties"]["Name"]["title"][0]["plain_text"]
            tooltip_lines.append(f"  {ICON_EVENT}{t}")
        except (KeyError, IndexError):
            pass

    print(json.dumps({
        "text": f"{ICON}{count}  {title[:20]}{'…' if len(title) > 20 else ''}",
        "tooltip": "\n".join(tooltip_lines),
        "class": "has-events"
    }))


if __name__ == "__main__":
    main()
