import Gsk from "gi://Gsk?version=4.0"
import Graphene from "gi://Graphene?version=1.0"
import GLib from "gi://GLib?version=2.0"
import Pango from "gi://Pango?version=1.0"
import { Gtk } from "ags/gtk4"
import { onCleanup } from "ags"

import { Thumb } from "./Wallpaper"
import {
  applyAt,
  busy,
  index,
  positionLabel,
  refresh,
  scenes,
  selectAt,
  status,
  titleLabel,
  type Scene,
} from "../state/wallpaper"
import { closePanel } from "../state/panel"

/**
 * A skewed cover-flow carousel, after motor-dev/wallpaperCarousel.
 *
 * That project could not be used directly and nothing from it is vendored: it
 * is QML and Luau for Quickshell, and this is GTK4 under AGS. Two different
 * toolkits in two different processes -- there is no way to load a QML plugin
 * into a GTK app. What is taken is the DESIGN, reproduced with its numbers:
 *
 *   card             300 x 420 portrait               (itemWidth/itemHeight)
 *   shear            x' = x + (-0.35)y                (skewFactor)
 *   centre card      scale 1.08, opacity 1.0          (selectedScale)
 *   neighbours       scale 0.75, opacity 0.1          (baseScale)
 *   z-order          centre on top, falling outward
 *   keys             left/right to browse, enter to pick, escape to close
 *
 * The shear is the whole look and GTK will not do it in CSS. Two dead ends
 * before this: gjs's cairo bindings expose neither cairo_transform nor
 * cairo_matrix_t, and a plain widget cannot be transformed at all. Gtk.Fixed
 * can -- set_child_transform takes an arbitrary Gsk.Transform -- so the cards
 * stay ordinary widgets, which matters: they are styled from _sidebar.scss like
 * everything else and re-skin with the palette switcher instead of freezing
 * whatever colours a Cairo path was written with.
 */

const CARD_W = 300
const CARD_H = 420

/**
 * Gap between card centres.
 *
 * A floor, not the value actually used: place() derives the real pitch from the
 * width the stage was given, so the outermost cards always land inside it. With
 * a fixed pitch the strip was simply wider than the panel and the far cards
 * were sliced off against its edge.
 */
const PITCH_MIN = 150

/** skewFactor -0.35 as an angle: tan(t) = -0.35 */
const SKEW_DEG = (Math.atan(-0.35) * 180) / Math.PI

const SCALE_NEAR = 1.08
const SCALE_FAR = 0.8
/**
 * How visible an off-centre card is.
 *
 * The reference plugin uses 0.1, which works there because its carousel is
 * fullscreen and the neighbours are enormous. In a panel this size 0.1 is
 * effectively invisible -- you cannot tell what you are about to swipe to,
 * which is the entire point of a carousel over a pair of arrows.
 */
const ALPHA_FAR = 0.42

/** how many cards each side of centre are worth placing at all */
const SPAN = 2

/**
 * Horizontal room one card needs at its largest, shear included.
 *
 * The shear leans the card by skewFactor * height, which is real width that
 * has to be budgeted for -- ignoring it clips the leading corner of the
 * outermost card even when the centres fit.
 */
const CARD_SPREAD = CARD_W * SCALE_NEAR + Math.abs(-0.35) * CARD_H * SCALE_NEAR

const FRAME_MS = 16
/** fraction of the remaining distance eaten per frame -- a critically damped feel */
const EASE = 0.22

export default function WallCarousel() {
  const fixed = new Gtk.Fixed()

  let cards: Gtk.Widget[] = []
  let list: Scene[] = []

  /** where the strip actually is, and where it is heading */
  let pos = 0
  let target = 0

  let width = 0
  let height = 0
  let ticking = 0

  function build(next: Scene[]) {
    for (const card of cards) fixed.remove(card)

    list = next
    cards = next.map((scene) => {
      const card = (
        <box orientation={Gtk.Orientation.VERTICAL} cssName="flowCard">
          <Thumb path={scene.preview} height={CARD_H - 26} />
          <label
            cssName="flowCardTitle"
            label={scene.title}
            xalign={0}
            maxWidthChars={30}
            ellipsize={Pango.EllipsizeMode.END}
          />
        </box>
      ) as Gtk.Widget

      card.set_size_request(CARD_W, CARD_H)

      // click to centre, click again to pick -- the plugin picks on a single
      // click, but its cards are not sheared under each other the way these are
      // and mis-clicking a neighbour there costs you nothing
      const at = next.indexOf(scene)
      const click = new Gtk.GestureClick()
      click.connect("released", () => {
        if (Math.round(target) === at) pick()
        else {
          target = at
          selectAt(at)
          animate()
        }
      })
      card.add_controller(click)

      fixed.put(card, 0, 0)
      return card
    })

    pos = index.peek()
    target = pos
    place()
  }

  /**
   * Lay the strip out for the current `pos`.
   *
   * Everything -- offset, scale, opacity, stacking -- is a function of distance
   * from centre, so a half-finished animation is just as valid a layout as a
   * settled one and there is no separate "in flight" state to keep right.
   */
  function place() {
    if (!cards.length || width <= 0) return

    const cx = width / 2
    const cy = height / 2

    // the widest the strip may be and still fit: half the stage, less half a
    // card, shared between the SPAN cards on that side
    const pitch = Math.max(PITCH_MIN, (width - CARD_SPREAD) / (2 * SPAN))

    // painted far-to-near so the centre card ends up on top: Gtk.Fixed draws in
    // child order, and there is no z-index to set
    const order = cards
      .map((_, i) => i)
      .sort((a, b) => Math.abs(b - pos) - Math.abs(a - pos))

    for (const i of order) {
      const card = cards[i]
      const offset = i - pos
      const distance = Math.abs(offset)

      if (distance > SPAN) {
        card.visible = false
        continue
      }

      card.visible = true

      const falloff = Math.max(0, 1 - distance)
      const scale = SCALE_FAR + (SCALE_NEAR - SCALE_FAR) * falloff

      card.opacity = ALPHA_FAR + (1 - ALPHA_FAR) * falloff

      // Gsk transforms are immutable: every call returns a NEW transform rather
      // than modifying this one, which is why each step reassigns.
      //
      // They are also typed `Transform | null`, because GSK collapses a
      // transform that works out to the identity down to null. Nothing here
      // minds -- every builder below and set_child_transform itself all treat
      // null as "identity" -- so the chain is typed nullable and passed along
      // rather than being asserted non-null.
      let transform: Gsk.Transform | null = new Gsk.Transform()
      transform = transform.translate(
        new Graphene.Point({ x: cx + offset * pitch, y: cy }),
      )
      transform = transform?.scale(scale, scale) ?? null
      // sheared about the card's own centre, so it leans rather than also
      // sliding sideways as it grows
      transform = transform?.skew(SKEW_DEG, 0) ?? null
      transform =
        transform?.translate(new Graphene.Point({ x: -CARD_W / 2, y: -CARD_H / 2 })) ?? null

      fixed.set_child_transform(card, transform)

      // re-append to lift it up the paint order
      fixed.remove(card)
      fixed.put(card, 0, 0)
      fixed.set_child_transform(card, transform)
    }
  }

  function tick() {
    const gap = target - pos

    if (Math.abs(gap) < 0.002) {
      pos = target
      place()
      ticking = 0
      return GLib.SOURCE_REMOVE
    }

    pos += gap * EASE
    place()
    return GLib.SOURCE_CONTINUE
  }

  function animate() {
    if (ticking) return
    ticking = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, tick)
  }

  /** Browsing only -- nothing touches the renderer until Enter. */
  function step(by: number) {
    if (!cards.length) return

    target = Math.max(0, Math.min(cards.length - 1, Math.round(target) + by))
    selectAt(target)
    animate()
  }

  function pick() {
    if (!cards.length) return
    applyAt(Math.round(target))
    closePanel()
  }

  const stage = (
    <box
      cssName="flowStage"
      hexpand
      vexpand
      $={(self: Gtk.Box) => {
        self.append(fixed)

        // Gtk.Fixed has no natural size of its own; without this the stage
        // collapses and every card is placed outside the visible area
        fixed.set_size_request(-1, CARD_H + 40)

        const scroll = new Gtk.EventControllerScroll({
          flags: Gtk.EventControllerScrollFlags.BOTH_AXES,
        })
        scroll.connect("scroll", (_c, dx: number, dy: number) => {
          step(dx + dy > 0 ? 1 : -1)
          return true
        })
        self.add_controller(scroll)

        const keys = new Gtk.EventControllerKey()
        keys.connect("key-pressed", (_c, keyval: number) => {
          switch (keyval) {
            case 0xff51: // Left
              step(-1)
              return true
            case 0xff53: // Right
              step(1)
              return true
            case 0xff0d: // Return
            case 0xff8d: // KP_Enter
              pick()
              return true
            default:
              return false
          }
        })
        self.add_controller(keys)

        self.connect("notify::width-request", () => place())

        // the stage only knows its size once allocated; GTK4 dropped
        // size-allocate, so this rides the frame clock instead
        self.connect("map", () => {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            const w = self.get_width()
            const h = self.get_height()
            if (w <= 0 || h <= 0) return GLib.SOURCE_CONTINUE

            width = w
            height = h
            pos = index.peek()
            target = pos
            place()
            return GLib.SOURCE_REMOVE
          })
        })

        build(scenes.peek())
        const drop = scenes.subscribe(() => build(scenes.peek()))

        onCleanup(() => {
          drop()
          if (ticking) GLib.source_remove(ticking)
        })
      }}
    />
  ) as Gtk.Widget

  return (
    <box orientation={Gtk.Orientation.VERTICAL} cssName="flowPanel" spacing={8}>
      {stage}

      <box cssName="wallRow" spacing={6}>
        <button class="wallKey" tooltipText="Previous (Left)" onClicked={() => step(-1)}>
          <label label="‹" />
        </button>
        <button class="wallKey" tooltipText="Next (Right)" onClicked={() => step(1)}>
          <label label="›" />
        </button>

        <box hexpand />
        <label cssName="wallTitle" label={titleLabel} />
        <label cssName="wallPosition" label={positionLabel} />
        <box hexpand />

        <button
          class="wallKey primary"
          tooltipText="Apply this scene (Enter)"
          sensitive={busy((b) => !b)}
          onClicked={() => pick()}
        >
          <label label="SET" />
        </button>
        <button class="wallKey" tooltipText="Rescan the workshop folder" onClicked={() => refresh()}>
          <label label="⟳" />
        </button>
      </box>

      <label cssName="wallStatus" label={status} xalign={0} wrap />
    </box>
  )
}
