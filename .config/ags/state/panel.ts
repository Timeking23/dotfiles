import { createMemo, createState } from "ags"

/**
 * Which sidebar panel is open.
 *
 * The drawer's panels used to be GTK popovers parented to their key. They were
 * never visible: on a Wayland layer-shell surface a popover is clipped to the
 * surface that owns it, and these open to the RIGHT of a 312px drawer -- which
 * is to say, entirely outside it. Every panel was being rendered into nothing,
 * which is why the keys looked like they did nothing.
 *
 * So the panels moved out to one shared window of their own, centred on the
 * screen, and this is the switch that says which of them it is showing. One
 * window rather than one each: they are mutually exclusive by nature, and a
 * single surface means one scrim, one Escape handler and one place for the
 * casing.
 */

export type PanelKey = "weather" | "wallpaper"

const [active, setActive] = createState<PanelKey | null>(null)

export { active as activePanel }

export const panelOpen = createMemo(() => active() !== null)

/** Stack pages need a name even when nothing is showing. */
export const panelPage = createMemo(() => active() ?? "weather")

export function openPanel(key: PanelKey) {
  setActive(key)
}

export function closePanel() {
  setActive(null)
}

export function togglePanel(key: PanelKey) {
  setActive(active.peek() === key ? null : key)
}
