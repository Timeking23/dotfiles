import AstalBluetooth from "gi://AstalBluetooth"
import AstalNetwork from "gi://AstalNetwork"
import { createBinding, createMemo } from "ags"

/**
 * Network and bluetooth, reduced to what fits in a bar: one glyph each, and a
 * tooltip for the detail.
 *
 * Nerd Font glyphs rather than the themed `iconName` these libraries expose —
 * an icon name resolves against whatever icon theme happens to be installed
 * and silently renders nothing when it does not match, whereas the font is
 * already a hard dependency of every other label on the bar.
 */

const ICON = {
  wifi: "\u{f1eb}", // fa-wifi
  wifiOff: "\u{f05aa}", // mdi-wifi-off
  wired: "\u{f0e8}", // fa-sitemap
  bt: "\u{f293}", // fa-bluetooth
  btOff: "\u{f00b2}", // mdi-bluetooth-off
}

// ------------------------------------------------------------------
// network
// ------------------------------------------------------------------

const network = AstalNetwork.get_default()
const wifi = network?.wifi ?? null

const primary = network ? createBinding(network, "primary") : null
const ssid = wifi ? createBinding(wifi, "ssid") : null
const strength = wifi ? createBinding(wifi, "strength") : null
const wifiEnabled = wifi ? createBinding(wifi, "enabled") : null

export const netIcon = createMemo(() => {
  if (primary?.() === AstalNetwork.Primary.WIRED) return ICON.wired
  if (!wifi || wifiEnabled?.() === false || !ssid?.()) return ICON.wifiOff
  return ICON.wifi
})

export const netClass = createMemo(() => {
  if (primary?.() === AstalNetwork.Primary.WIRED) return "netStatus up"
  return ssid?.() ? "netStatus up" : "netStatus down"
})

export const netTooltip = createMemo(() => {
  if (primary?.() === AstalNetwork.Primary.WIRED) return "Wired"
  const name = ssid?.()
  if (!name) return "No network"
  return `${name} · ${strength?.() ?? 0}%`
})

// ------------------------------------------------------------------
// bluetooth
// ------------------------------------------------------------------

const bluetooth = AstalBluetooth.get_default()

const powered = bluetooth ? createBinding(bluetooth, "isPowered") : null
const connected = bluetooth ? createBinding(bluetooth, "isConnected") : null
const devices = bluetooth ? createBinding(bluetooth, "devices") : null

export const btIcon = createMemo(() => (powered?.() ? ICON.bt : ICON.btOff))

export const btClass = createMemo(() => {
  if (!powered?.()) return "btStatus off"
  return connected?.() ? "btStatus linked" : "btStatus on"
})

export const btTooltip = createMemo(() => {
  if (!powered?.()) return "Bluetooth off"

  const linked = (devices?.() ?? []).filter((d) => d.connected)
  if (!linked.length) return "Bluetooth on · nothing connected"
  return linked.map((d) => d.name || d.address).join(", ")
})
