#!/bin/bash
status=$(nmcli -t -f NAME,TYPE con show --active | grep vpn)
if [ -n "$status" ]; then
    protonvpn disconnect
else
    protonvpn connect &
fi
