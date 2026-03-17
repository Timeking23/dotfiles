#!/usr/bin/env python3
import subprocess
import json

def get_vpn_status():
    try:
        out = subprocess.check_output(
            ["nmcli", "-t", "-f", "NAME,TYPE,STATE", "con", "show", "--active"],
            text=True
        )
        for line in out.splitlines():
            if "vpn" in line.lower():
                name = line.split(":")[0]
                return "connected", name
        return "disconnected", ""
    except Exception:
        return "disconnected", ""

status, name = get_vpn_status()

icons = {"connected": "🟢", "disconnected": "🔴"}

print(json.dumps({
    "text": icons.get(status, "🔴"),
    "tooltip": f"ProtonVPN: {name}" if status == "connected" else "ProtonVPN: Disconnected",
    "class": status
}))
