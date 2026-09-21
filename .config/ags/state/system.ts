import AstalBattery from "gi://AstalBattery"
import AstalHyprland from "gi://AstalHyprland"
import GLib from "gi://GLib?version=2.0"
import { createBinding, createMemo } from "ags"
import { createPoll } from "ags/time"

// ============================
// CLOCK
// ============================

export const time = createPoll(
  "",
  1000,
  () => GLib.DateTime.new_now_local().format("%A, %B %d - %I:%M %p") ?? "",
)

export const date = createPoll(
  "",
  60_000,
  () => GLib.DateTime.new_now_local().format("%A, %B %d") ?? "",
)

// ============================
// HYPRLAND
// ============================

const hyprland = AstalHyprland.get_default()

export const workspaces = createBinding(hyprland, "workspaces")
export const focusedWorkspace = createBinding(hyprland, "focusedWorkspace")
export const allClients = createBinding(hyprland, "clients")

/**
 * True when the focused workspace holds no windows.
 *
 * Depends on the top-level `clients` binding as well as the workspace itself:
 * Workspace.clients is a plain getter with no change signal of its own, so
 * without tracking the global list this would never re-evaluate when a window
 * opens or closes on the current workspace.
 */
export const desktopIsEmpty = createMemo(() => {
  const clients = allClients()
  const focused = focusedWorkspace()
  if (!focused) return clients.length === 0

  return !clients.some((client) => client.workspace?.id === focused.id)
})

export const workspaceLabel = createMemo(() => {
  const id = focusedWorkspace()?.id
  return id === undefined ? "----" : id.toString().padStart(2, "0")
})

export const hostLabel = (GLib.get_host_name() ?? "unknown").toUpperCase()
export const userLabel = (GLib.get_user_name() ?? "operator").toUpperCase()

export const clockLabel = createPoll(
  "",
  1000,
  () => GLib.DateTime.new_now_local().format("%H:%M:%S") ?? "",
)

export const dateLabel = createPoll(
  "",
  60_000,
  () => GLib.DateTime.new_now_local().format("%d.%m.%Y") ?? "",
)

// ============================
// BATTERY
// ============================

const battery = AstalBattery.get_default()

/** 0..1 float, not 0..100 */
export const batteryPercentage = createBinding(battery, "percentage")
export const batteryCharging = createBinding(battery, "charging")
export const batteryState = createBinding(battery, "state")
export const batteryIsPresent = createBinding(battery, "isPresent")

const timeToEmpty = createBinding(battery, "timeToEmpty")
const timeToFull = createBinding(battery, "timeToFull")

export const batteryLabel = createMemo(
  () => `${Math.round(batteryPercentage() * 100)}%`,
)

/**
 * Adwaita ships battery-level-{0,10,...,100}-symbolic and a -charging-
 * variant of each, so the icon can carry both the level and the plug state
 * without us drawing anything.
 */
export const batteryIcon = createMemo(() => {
  if (!batteryIsPresent()) return "battery-missing-symbolic"
  if (batteryState() === AstalBattery.State.FULLY_CHARGED) {
    return "battery-level-100-charged-symbolic"
  }

  const level = Math.min(100, Math.max(0, Math.round(batteryPercentage() * 10) * 10))

  if (!batteryCharging()) return `battery-level-${level}-symbolic`

  // Adwaita's -charging- variants stop at 90: at full it is named "charged",
  // so battery-level-100-charging-symbolic does not exist and rendered as a
  // missing-icon glyph at anything above 95%.
  return level >= 100
    ? "battery-level-100-charged-symbolic"
    : `battery-level-${level}-charging-symbolic`
})

/** Charging outranks level — a plugged-in 5% battery is not an emergency. */
export const batteryClass = createMemo(() => {
  // UPower reports charging:false once it tops out, so this needs its own branch
  if (batteryState() === AstalBattery.State.FULLY_CHARGED) return "battery charged"
  if (batteryCharging()) return "battery charging"

  const percent = batteryPercentage()
  if (percent <= 0.1) return "battery critical"
  if (percent <= 0.25) return "battery low"
  return "battery"
})

export const batteryStateLabel = createMemo(() => {
  switch (batteryState()) {
    case AstalBattery.State.FULLY_CHARGED:
      return "FULLY CHARGED"
    case AstalBattery.State.CHARGING:
      return "CHARGING"
    case AstalBattery.State.DISCHARGING:
      return "DISCHARGING"
    case AstalBattery.State.EMPTY:
      return "EMPTY"
    default:
      return "UNKNOWN"
  }
})

export const batteryTooltip = createMemo(() => {
  if (batteryState() === AstalBattery.State.FULLY_CHARGED) return "Fully charged"

  const charging = batteryCharging()
  const seconds = Number(charging ? timeToFull() : timeToEmpty())

  if (!seconds || seconds <= 0) return charging ? "Charging" : "On battery"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  return charging ? `${remaining} until full` : `${remaining} remaining`
})
