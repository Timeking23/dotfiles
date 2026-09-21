import { Gtk, Gdk } from "ags/gtk4"
import { createMemo, createState } from "ags"
import { execAsync } from "ags/process"

import oxideCss from "../style-oxide.scss"
import phosphorCss from "../style-phosphor.scss"

/**
 * Bar button that re-skins the running shell, live.
 *
 * $palette-name is a compile-time Sass variable, so a palette cannot be swapped
 * the way the font could -- 55 colours land in hundreds of rules, and there is
 * no single declaration to override. Instead the whole stylesheet is compiled
 * once per palette at build time (style-oxide.scss, style-phosphor.scss) and
 * the finished CSS is pushed into one provider at USER priority, above the
 * stylesheet app.start() installed.
 *
 * "Default" is the absence of an override: the provider is loaded with an empty
 * string and the base stylesheet -- gunmetal -- shows through again. That means
 * reset can never drift out of sync with whatever style.scss currently says.
 *
 *   left click   cycle  DEFAULT -> OXIDE -> PHOSPHOR -> DEFAULT
 *   right click  reset straight back to DEFAULT
 */

const PALETTES: Array<[label: string, css: string]> = [
  ["DEFAULT", ""],
  ["OXIDE", oxideCss],
  ["PHOSPHOR", phosphorCss],
]

/**
 * The same three accents, for the compositor.
 *
 * Hyprland draws the window borders and the shadow glow, and it is NOT styled
 * by our stylesheet -- so re-skinning the shell used to leave every window
 * outlined in Catppuccin blue (89b4fa) regardless of which palette was loaded.
 * The glow is part of the HUD as far as anyone looking at the screen is
 * concerned, so it has to move with it.
 *
 * Hardcoding one colour in hyprland.conf would only be right for one palette.
 * These are violet-300 and violet-200 from each palette in style/_palette.scss
 * -- the same two the shell uses for an engaged control and its highlight.
 * Keep them in step with that file; there is no way to read Sass from here.
 */
const HYPR_ACCENT: Array<[base: string, highlight: string]> = [
  ["b3a4e6", "ded4ff"], // gunmetal  (DEFAULT)
  ["e6c9a4", "ffecd4"], // oxide
  ["c7e6a4", "ebffd4"], // phosphor
]

/**
 * Push the palette's accent to the compositor.
 *
 * Fire-and-forget: the shell must not care whether hyprctl is slow, and a
 * failure here is cosmetic. Errors are logged rather than thrown so a missing
 * hyprctl (running under something other than Hyprland) cannot break the
 * palette button itself.
 *
 * `ee` and `66` are the alpha bytes -- the border nearly solid, the shadow a
 * glow. Hyprland wants rgba() as 8 hex digits, not a CSS rgba().
 *
 * Spawned as an ARGV LIST, with no shell. Going through `bash -c` meant the
 * parentheses in rgba(...) reached bash unquoted, which is a syntax error
 * before hyprctl ever ran. There is nothing here that needs a shell anyway --
 * no pipes, no globs -- and the value is one argument however many spaces the
 * gradient has in it.
 */
function syncCompositor(index: number) {
  const [base, highlight] = HYPR_ACCENT[index] ?? HYPR_ACCENT[0]

  const commands = [
    ["hyprctl", "keyword", "general:col.active_border",
      `rgba(${base}ee) rgba(${highlight}ee) 45deg`],
    ["hyprctl", "keyword", "decoration:shadow:color", `rgba(${base}66)`],
  ]

  for (const command of commands) {
    execAsync(command).catch((error) =>
      console.warn("palette: could not reskin the compositor:", error),
    )
  }
}

const provider = new Gtk.CssProvider()
let attached = false

/**
 * Which palette is loaded, as observable state.
 *
 * At module scope rather than inside the component because widgets that paint
 * themselves need it. Anything drawn with Cairo cannot inherit CSS, so it reads
 * its colours through get_color() -- and it has to be told when to look again,
 * or a re-skin leaves the drawn parts of the shell on the old palette until
 * something else happens to repaint them.
 */
const [paletteIndex, setPaletteIndex] = createState(0)

export { paletteIndex }

function apply(css: string) {
  provider.load_from_string(css)

  if (!attached) {
    const display = Gdk.Display.get_default()
    if (!display) return
    Gtk.StyleContext.add_provider_for_display(
      display,
      provider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER,
    )
    attached = true
  }
}

//  Also on startup, not only on a click: hyprland.conf carries the gunmetal
//  accent as its own default, but if the shell is restarted while a different
//  palette was showing, the compositor would otherwise stay on whatever it was
//  last told.
syncCompositor(paletteIndex.peek())

export default function Palette() {
  const index = paletteIndex

  const label = createMemo(() => PALETTES[index()][0])

  const tooltip = createMemo(() => {
    const i = index()
    return `Palette: ${PALETTES[i][0]} (${i + 1}/${PALETTES.length})\n`
      + "Left click for the next one, right click to reset."
  })

  function go(next: number) {
    setPaletteIndex(next)
    apply(PALETTES[next][1])
    syncCompositor(next)
  }

  return (
    <button
      class="palette"
      tooltipText={tooltip}
      onClicked={() => go((index() + 1) % PALETTES.length)}
      $={(self: Gtk.Button) => {
        // right click resets. GestureClick rather than a second button: the bar
        // is already busy, and reset is a rescue action, not a primary one.
        const secondary = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
        secondary.connect("pressed", () => go(0))
        self.add_controller(secondary)
      }}
    >
      <label label={label} />
    </button>
  )
}
