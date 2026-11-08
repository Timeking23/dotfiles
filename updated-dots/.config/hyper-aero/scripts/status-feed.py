#!/usr/bin/env python3
import glob
import json
import os
import subprocess
import threading
import time

HOME = os.path.expanduser("~")
APPS = os.path.join(HOME, ".config/hyper-aero/status-desktop/apps.json")
RUN = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
OUT = os.path.join(RUN, "aero-status.json")
INTERVAL = 2.0
TICK = os.sysconf("SC_CLK_TCK")
PAGE = os.sysconf("SC_PAGE_SIZE")
NCPU = os.cpu_count() or 1
GALLERY = os.path.join(HOME, "Pictures/Gallery")
CACHE = os.path.join(HOME, ".cache/hyper-aero/gallery")
TARGET = 2880
GPU_SLOT = "/sys/bus/pci/devices/0000:01:00.0/power/runtime_status"


def read(path, default=""):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def num(path, default=0):
    try:
        return int(read(path))
    except ValueError:
        return default


def hwmon(name):
    for h in glob.glob("/sys/class/hwmon/hwmon*"):
        if read(h + "/name") == name:
            return h
    return ""


def hypr(*args):
    try:
        r = subprocess.run(["hyprctl", "-j", *args], capture_output=True, text=True, timeout=2)
        return json.loads(r.stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def load_apps():
    try:
        with open(APPS) as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def gpu():
    if read(GPU_SLOT) == "suspended":
        return {"state": "SLEEP", "load": 0, "mhz": 0, "temp": 0, "watts": 0, "vram": 0, "vramMax": 0}
    q = "utilization.gpu,clocks.gr,temperature.gpu,power.draw,memory.used,memory.total"
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=" + q, "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=3)
        v = [x.strip() for x in r.stdout.splitlines()[0].split(",")]
        return {"state": "ACTIVE", "load": int(float(v[0])), "mhz": int(float(v[1])), "temp": int(float(v[2])),
                "watts": round(float(v[3]), 1), "vram": int(float(v[4])), "vramMax": int(float(v[5]))}
    except (OSError, IndexError, ValueError, subprocess.SubprocessError):
        return {"state": "N/A", "load": 0, "mhz": 0, "temp": 0, "watts": 0, "vram": 0, "vramMax": 0}


def cpu_times():
    v = [int(x) for x in read("/proc/stat").splitlines()[0].split()[1:9]]
    return sum(v), v[3] + v[4]


def procs():
    out = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            with open(f"/proc/{d}/stat") as f:
                s = f.read()
            with open(f"/proc/{d}/statm") as f:
                m = f.read().split()
        except OSError:
            continue
        l, r = s.index("("), s.rindex(")")
        rest = s[r + 2:].split()
        out[int(d)] = {
            "comm": s[l + 1:r],
            "ppid": int(rest[1]),
            "ticks": int(rest[11]) + int(rest[12]),
            "mb": max(0, int(m[1]) - int(m[2])) * PAGE / 1048576,
        }
    return out


def sync_gallery():
    from PIL import Image, ImageFilter

    os.makedirs(CACHE, exist_ok=True)
    wanted = set()
    for name in os.listdir(GALLERY):
        src = os.path.join(GALLERY, name)
        dst = os.path.join(CACHE, name)
        if name.startswith(".") or not os.path.isfile(src):
            continue
        wanted.add(name)
        try:
            if os.path.lexists(dst) and os.lstat(dst).st_mtime >= os.path.getmtime(src):
                continue
            with Image.open(src) as im:
                w, h = im.size
                if w >= TARGET * 0.6:
                    if os.path.lexists(dst):
                        os.remove(dst)
                    os.symlink(src, dst)
                    continue
                big = im.convert("RGB").resize((TARGET, round(h * TARGET / w)), Image.LANCZOS)
            big = big.filter(ImageFilter.UnsharpMask(radius=3, percent=70, threshold=2))
            tmp = dst + ".part"
            big.save(tmp, format="JPEG" if name.lower().endswith(("jpg", "jpeg")) else "PNG", quality=93)
            os.replace(tmp, dst)
        except OSError:
            continue
    for name in os.listdir(CACHE):
        if name not in wanted:
            os.remove(os.path.join(CACHE, name))


def gallery_loop():
    while True:
        try:
            sync_gallery()
        except (OSError, ImportError):
            pass
        time.sleep(30)


class Feed:
    def __init__(self):
        self.k10 = hwmon("k10temp")
        self.asus = hwmon("asus")
        self.amd = hwmon("amdgpu")
        self.bat = (glob.glob("/sys/class/power_supply/BAT*") or [""])[0]
        self.ram_total = 0
        for line in read("/proc/meminfo").splitlines():
            if line.startswith("MemTotal"):
                self.ram_total = int(line.split()[1]) / 1024
        self.prev_cpu = cpu_times()
        self.prev_ticks = {}
        self.prev_t = time.monotonic()
        self.ema = {}

    def system(self):
        total, idle = cpu_times()
        dt = total - self.prev_cpu[0]
        di = idle - self.prev_cpu[1]
        self.prev_cpu = (total, idle)
        freqs = [num(p) for p in glob.glob("/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq")]
        info = {}
        for line in read("/proc/meminfo").splitlines():
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0])
        used = (info["MemTotal"] - info["MemAvailable"]) / 1048576
        return {
            "cpu": {
                "load": round(100 * (dt - di) / dt) if dt > 0 else 0,
                "ghz": round(sum(freqs) / len(freqs) / 1e6, 2) if freqs else 0,
                "temp": round(num(self.k10 + "/temp1_input") / 1000),
                "watts": round(num(self.amd + "/power1_input") / 1e6, 1),
            },
            "gpu": gpu(),
            "fans": {
                "cpu": num(self.asus + "/fan1_input"),
                "gpu": num(self.asus + "/fan2_input"),
                "mid": num(self.asus + "/fan3_input"),
                "profile": read("/sys/firmware/acpi/platform_profile").upper() or "--",
            },
            "mem": {"pct": round(100 * used / (info["MemTotal"] / 1048576)), "used": round(used, 1),
                    "total": round(info["MemTotal"] / 1048576, 1)},
            "bat": {"pct": num(self.bat + "/capacity"), "state": read(self.bat + "/status").upper()},
        }

    def attribute(self, table, clients):
        byclass, bycomm = {}, {}
        for a in table:
            for c in a.get("class", []):
                byclass[c.lower()] = a
            for c in a.get("match", []):
                bycomm[c] = a
        roots = {}
        for pid, p in self.ps.items():
            a = bycomm.get(p["comm"])
            parent = self.ps.get(p["ppid"], {})
            if a and bycomm.get(parent.get("comm")) is not a:
                roots[pid] = a["id"]
        extra = {}
        for c in clients:
            cls = (c.get("class") or c.get("initialClass") or "window").lower()
            a = byclass.get(cls)
            if not a:
                a = bycomm.get(self.ps.get(c["pid"], {}).get("comm", ""))
            if a:
                roots[c["pid"]] = a["id"]
            else:
                key = "win:" + cls
                extra[key] = c.get("class") or cls
                roots[c["pid"]] = key
        return roots, extra

    def usage(self, clients, table):
        self.ps = procs()
        now = time.monotonic()
        dt = max(0.1, now - self.prev_t)
        self.prev_t = now
        roots, extra = self.attribute(table, clients)

        memo = {}

        def owner(pid):
            chain = []
            while pid > 1 and pid in self.ps:
                if pid in memo:
                    found = memo[pid]
                    break
                if pid in roots:
                    found = pid
                    break
                chain.append(pid)
                pid = self.ps[pid]["ppid"]
            else:
                found = None
            for c in chain:
                memo[c] = found
            return found

        ticks = {}
        cpu, ram = {}, {}
        for pid, p in self.ps.items():
            ticks[pid] = p["ticks"]
            root = owner(pid)
            if root is None:
                continue
            ram[root] = ram.get(root, 0) + p["mb"]
            before = self.prev_ticks.get(pid, p["ticks"])
            used = max(0, p["ticks"] - before) / TICK / dt / NCPU * 100
            cpu[root] = cpu.get(root, 0) + used
        self.prev_ticks = ticks

        for root in list(self.ema):
            if root not in roots:
                del self.ema[root]
        for root in roots:
            self.ema[root] = self.ema.get(root, cpu.get(root, 0)) * 0.5 + cpu.get(root, 0) * 0.5

        apps = {}
        for a in table:
            apps[a["id"]] = {"id": a["id"], "name": a["name"], "cpu": 0, "ram": 0, "open": False, "windows": 0, "addr": ""}
        for key, name in extra.items():
            apps[key] = {"id": key, "name": name, "cpu": 0, "ram": 0, "open": False, "windows": 0, "addr": ""}
        for root, key in roots.items():
            a = apps[key]
            a["open"] = True
            a["cpu"] += self.ema.get(root, 0)
            a["ram"] += ram.get(root, 0)

        tabs = {}
        order = sorted(clients, key=lambda c: c.get("focusHistoryID", 99))
        for c in reversed(order):
            key = roots.get(c["pid"])
            a = apps.get(key)
            if a:
                a["windows"] += 1
                a["addr"] = c["address"]
        for c in order:
            pid = c["pid"]
            if pid in tabs:
                continue
            a = apps.get(roots.get(pid))
            tabs[pid] = {"id": a["id"] if a else "", "name": a["name"] if a else c.get("class", "?"),
                         "title": c.get("title", ""), "addr": c["address"],
                         "cpu": round(self.ema.get(pid, 0), 1), "ram": round(ram.get(pid, 0)),
                         "icon": a["id"] if a else ""}

        def weight(x):
            return x["cpu"] + 100 * x["ram"] / self.ram_total

        top = sorted(tabs.values(), key=weight, reverse=True)[:5]
        rows = sorted(apps.values(), key=lambda a: (not a["open"], -weight(a), a["name"].lower()))
        for a in rows:
            a["cpu"] = round(a["cpu"], 1)
            a["ram"] = round(a["ram"])
        return top, rows


def main():
    threading.Thread(target=gallery_loop, daemon=True).start()
    feed = Feed()
    while True:
        t0 = time.monotonic()
        clients = [c for c in (hypr("clients") or []) if c.get("mapped", True) and c.get("pid", 0) > 0]
        ws = hypr("activeworkspace") or {}
        covered = any(c.get("workspace", {}).get("id") == ws.get("id") and not c.get("floating") for c in clients)
        top, apps = feed.usage(clients, load_apps())
        data = feed.system()
        data.update({"top": top, "apps": apps, "covered": covered})
        line = json.dumps(data, separators=(",", ":"))
        tmp = OUT + ".tmp"
        with open(tmp, "w") as f:
            f.write(line)
        os.replace(tmp, OUT)
        print(line, flush=True)
        time.sleep(max(0.2, INTERVAL - (time.monotonic() - t0)))


if __name__ == "__main__":
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
