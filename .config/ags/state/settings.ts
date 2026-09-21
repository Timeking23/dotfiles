import AstalBluetooth from "gi://AstalBluetooth"
import AstalNetwork from "gi://AstalNetwork"
import AstalWp from "gi://AstalWp"
import AstalBrightness from "gi://AstalBrightness"
import { createBinding, createMemo } from "ags"

/**
 * The toggles and levels behind the settings panel.
 *
 * Every device here can be absent -- no wifi card, no bluetooth adapter, no
 * wireplumber -- so each one is guarded the same way state/status.ts guards its
 * two: bind only if the object exists, and read through `?.()` at the call
 * site. A panel that renders with a dead row is better than a shell that fails
 * to start on a machine without bluetooth.
 */

// ---------------------------------------------------------------- wifi

const network = AstalNetwork.get_default()
const wifi = network?.wifi ?? null

export const hasWifi = wifi !== null

const wifiEnabledRaw = wifi ? createBinding(wifi, "enabled") : null
const ssidRaw = wifi ? createBinding(wifi, "ssid") : null
const strengthRaw = wifi ? createBinding(wifi, "strength") : null

export const wifiEnabled = createMemo(() => wifiEnabledRaw?.() ?? false)

export const wifiLabel = createMemo(() => {
  if (!wifi) return "NO ADAPTER"
  if (!wifiEnabledRaw?.()) return "OFF"
  const name = ssidRaw?.()
  return name ? `${name}  ${strengthRaw?.() ?? 0}%` : "SCANNING"
})

export function toggleWifi() {
  if (wifi) wifi.set_enabled(!wifi.enabled)
}

// ---------------------------------------------------------------- bluetooth

const bluetooth = AstalBluetooth.get_default()

export const hasBluetooth = bluetooth !== null

const btPoweredRaw = bluetooth ? createBinding(bluetooth, "isPowered") : null
const btDevicesRaw = bluetooth ? createBinding(bluetooth, "devices") : null

export const btPowered = createMemo(() => btPoweredRaw?.() ?? false)

export const btLabel = createMemo(() => {
  if (!bluetooth) return "NO ADAPTER"
  if (!btPoweredRaw?.()) return "OFF"

  const linked = (btDevicesRaw?.() ?? []).filter((d) => d.connected)
  if (!linked.length) return "ON"
  return linked.map((d) => d.name || d.address).join(", ")
})

export function toggleBluetooth() {
  if (bluetooth) bluetooth.isPowered = !bluetooth.isPowered
}

// ---------------------------------------------------------------- audio

const speaker = AstalWp.get_default()?.defaultSpeaker ?? null

export const hasAudio = speaker !== null

const volumeRaw = speaker ? createBinding(speaker, "volume") : null
const mutedRaw = speaker ? createBinding(speaker, "mute") : null

/** 0..1, clamped -- wireplumber will report over 1 for boosted sinks */
export const volume = createMemo(() => Math.min(1, Math.max(0, volumeRaw?.() ?? 0)))
export const muted = createMemo(() => mutedRaw?.() ?? false)

export const volumeLabel = createMemo(() =>
  mutedRaw?.() ? "MUTED" : `${Math.round((volumeRaw?.() ?? 0) * 100)}%`,
)

export function setVolume(value: number) {
  speaker?.set_volume(Math.min(1, Math.max(0, value)))
}

export function toggleMute() {
  if (speaker) speaker.mute = !speaker.mute
}

// ---------------------------------------------------------------- brightness

const screen = AstalBrightness.get_default().get_screen()

const brightnessRaw = screen ? createBinding(screen, "brightness") : null

export const hasBrightness = screen !== null
export const brightness = createMemo(() => brightnessRaw?.() ?? 0)
export const brightnessLabel = createMemo(
  () => `${Math.round((brightnessRaw?.() ?? 0) * 100)}%`,
)

export function setBrightness(value: number) {
  screen?.set_brightness(Math.min(1, Math.max(0, value)))
}
