import { Gtk } from "ags/gtk4"
import { onCleanup, type Accessor } from "ags"
import type Cairo from "cairo"

/**
 * ============================================================================
 * <Canvas> -- the one hand-drawn widget primitive
 * ============================================================================
 *
 * NEW HERE? READ THIS FIRST. Most of the instruments in this shell (the dials,
 * the sparkline, the CPU crystal, the memory mesh, the filesystem graph) are
 * not built out of GTK widgets at all. They are a blank rectangle that we paint
 * ourselves with Cairo, which is a 2D drawing API: "move the pen here, draw a
 * line to there, fill this arc with this colour".
 *
 * GTK gives us `Gtk.DrawingArea` for exactly that. But a DrawingArea on its own
 * is only half the story, and the other half is the same boilerplate every
 * single time:
 *
 *   1. A DrawingArea does not know when to repaint. You must call queue_draw()
 *      yourself whenever the thing it is showing has changed.
 *   2. The data comes from an Accessor (see the reactivity note below), so you
 *      have to subscribe to it -- and unsubscribe, or you leak.
 *   3. Anything that MOVES needs a frame clock callback, which is GTK's
 *      "call me once per monitor refresh" hook.
 *   4. All of that must stop when the widget is off screen. Windows in this
 *      config hide and show constantly (the system monitor only appears on an
 *      empty workspace), and a hidden widget that keeps animating is pure
 *      battery drain on a laptop.
 *
 * Eight widgets each wrote their own copy of that dance, with small differences
 * that were bugs rather than decisions. This file is that dance, written once.
 *
 * ----------------------------------------------------------------------------
 * A 60-SECOND NOTE ON REACTIVITY, because the rest of the config assumes it
 * ----------------------------------------------------------------------------
 *
 * An `Accessor<T>` is AGS's reactive value -- think "a variable that can tell
 * you when it changed". You use it three ways:
 *
 *   cpuUsage()              read it, and (inside a computed) subscribe to it
 *   cpuUsage.peek()         read it WITHOUT subscribing
 *   cpuUsage.subscribe(fn)  run fn on every change; returns an unsubscribe fn
 *
 * Inside JSX you normally just hand the Accessor straight to a prop
 * (`<label label={cpuLabel} />`) and AGS keeps the widget in sync for you.
 * Canvas exists because a DrawingArea has no such prop -- there is no
 * "picture" attribute to bind, only a draw callback -- so the subscription has
 * to be wired by hand. Canvas is that hand.
 *
 * ----------------------------------------------------------------------------
 * HOW TO USE IT
 * ----------------------------------------------------------------------------
 *
 * A still picture that repaints when its data changes:
 *
 *     <Canvas
 *       heightRequest={54}
 *       watch={[cpuHistory]}
 *       draw={(cr, width, height) => {
 *         cr.setSourceRGBA(1, 1, 1, 1)
 *         cr.rectangle(0, 0, width, height)
 *         cr.fill()
 *       }}
 *     />
 *
 * Something that animates. `animate` is called with the seconds elapsed since
 * the previous frame; return true when you have changed something and want the
 * result painted:
 *
 *     <Canvas
 *       fps={20}
 *       watch={[memPercent]}
 *       animate={(dt) => {
 *         angle += dt * SPIN
 *         return true
 *       }}
 *       draw={...}
 *     />
 *
 * Something the user can grab. `setup` runs once, gets the real widget, and may
 * return a teardown function:
 *
 *     <Canvas
 *       setup={(area) => {
 *         const drag = new Gtk.GestureDrag()
 *         drag.connect("drag-update", ...)
 *         area.add_controller(drag)
 *       }}
 *       draw={...}
 *     />
 *
 * Everything Canvas does not recognise (hexpand, widthRequest, cssName, ...) is
 * passed straight through to the underlying <drawingarea>.
 */

/** Seconds between frames is clamped to this, so a stall cannot jump physics. */
const MAX_DELTA = 0.1

export type DrawFn = (
  cr: Cairo.Context,
  width: number,
  height: number,
  /**
   * The widget itself. Only needed when the drawing depends on something GTK
   * owns -- `area.get_color()` is the big one: a Cairo widget cannot inherit a
   * stylesheet, so reading the CSS `color` is the single hook that lets hand-
   * drawn furniture follow the palette switcher like every styled widget does.
   */
  area: Gtk.DrawingArea,
) => void

export type CanvasProps = {
  /**
   * Paint one frame. Called by GTK with a fresh Cairo context and the widget's
   * CURRENT size -- never assume the size you asked for, a box can stretch you.
   *
   * The context starts clean and is thrown away afterwards, so there is nothing
   * to reset and nothing to leak. Keep this a pure function of your own state:
   * do not subscribe, allocate timers, or mutate reactive values in here.
   */
  draw: DrawFn

  /**
   * Reactive values this drawing depends on. While the widget is on screen,
   * a change to any of them runs `onChange` (if given) and repaints.
   *
   * Canvas deliberately does NOT hand you the values -- read them with
   * `.peek()` inside `draw` or `onChange`. `peek()` rather than `()` because
   * a draw callback is not a reactive scope, so calling `()` there would
   * silently fail to track anyway.
   */
  watch?: ReadonlyArray<Accessor<unknown>>

  /**
   * Runs when a watched value changes, just before the repaint. Use it to copy
   * reactive values into the plain local variables `draw` reads, or to kick a
   * physics simulation awake.
   */
  onChange?: () => void

  /**
   * Called once per frame while on screen, with the seconds since the previous
   * frame (clamped -- see MAX_DELTA). Return true to repaint this frame.
   *
   * Return false to skip the repaint but keep the clock running; that is how
   * the dials advance a smooth phase at 60Hz while only painting at 20.
   *
   * Omit this entirely for a still picture -- no frame clock is installed at
   * all, which is the cheapest thing a widget can be.
   */
  animate?: (dt: number) => boolean

  /**
   * Cap how often `animate` runs, in frames per second. Without it, animate is
   * called on every frame the compositor produces (144Hz on this machine, which
   * is a lot of force-directed physics for a 300px graph).
   *
   * The dt you receive is always real elapsed time, so capping the rate slows
   * the DRAWING and never the motion.
   */
  fps?: number

  /**
   * Runs when the widget leaves the screen, after its subscriptions and frame
   * clock have been torn down. Use it to reset animation state so the widget
   * does not flash its last frame when it comes back.
   */
  onHide?: () => void

  /**
   * Escape hatch for anything that needs the real Gtk.DrawingArea: gesture
   * controllers, scroll handlers, keyboard controllers. Runs once at
   * construction. Return a function to undo it at teardown.
   */
  setup?: (area: Gtk.DrawingArea) => (() => void) | void
} & Record<string, unknown>

export default function Canvas({
  draw,
  watch,
  onChange,
  animate,
  fps,
  onHide,
  setup,
  ...rest
}: CanvasProps) {
  return (
    <drawingarea
      {...rest}
      $={(area: Gtk.DrawingArea) => {
        // --- painting -------------------------------------------------------
        // GTK calls this whenever it needs pixels: after our queue_draw(), but
        // also on resize, on theme change, or when another window uncovers us.
        area.set_draw_func((_area, cr, width, height) =>
          draw(cr as unknown as Cairo.Context, width, height, area),
        )

        // --- everything below only runs while the widget is on screen -------
        // `unsubscribes` doubling as the "are we running?" flag is deliberate:
        // map can fire twice (a window shown, hidden and shown again) and
        // starting twice would install two frame clocks that both draw.
        let unsubscribes: Array<() => void> = []
        let tick = 0
        let previousFrame = 0
        let sinceDraw = 0

        function startClock() {
          if (tick || !animate) return

          previousFrame = 0
          sinceDraw = 0

          // A tick callback is GTK's frame clock: it fires in step with the
          // monitor, is automatically throttled when the window is occluded,
          // and hands us a timestamp in MICROseconds.
          tick = area.add_tick_callback((_widget, clock) => {
            const now = clock.get_frame_time()
            // first frame has no previous to measure against, so dt is 0
            const dt = previousFrame ? Math.min((now - previousFrame) / 1e6, MAX_DELTA) : 0
            previousFrame = now

            sinceDraw += dt
            if (fps && sinceDraw < 1 / fps) return true // too soon; wait

            const elapsed = sinceDraw
            sinceDraw = 0

            if (animate!(elapsed)) area.queue_draw()
            return true // GLib.SOURCE_CONTINUE -- keep the clock running
          })
        }

        function stopClock() {
          if (!tick) return
          area.remove_tick_callback(tick)
          tick = 0
        }

        function start() {
          if (unsubscribes.length) return

          // Subscribe FIRST, then do one update, so a change landing between
          // the two is not missed.
          unsubscribes = (watch ?? []).map((source) =>
            source.subscribe(() => {
              onChange?.()
              area.queue_draw()
            }),
          )

          onChange?.()
          area.queue_draw()
          startClock()
        }

        function stop() {
          // Nothing to tear down means we were never started; without this
          // guard onHide would fire on every unmap of an already-idle widget.
          if (!unsubscribes.length && !tick) return

          // splice(0) empties the array and hands us the old contents, so this
          // is both "run every teardown" and "mark ourselves stopped".
          unsubscribes.splice(0).forEach((off) => off())
          stopClock()
          onHide?.()
        }

        area.connect("map", start)
        area.connect("unmap", stop)
        // A widget inside an already-visible window will never emit `map`,
        // because it was mapped before we got here.
        if (area.get_mapped()) start()

        const teardown = setup?.(area)

        // onCleanup is AGS's "this widget is being destroyed" hook. Without it
        // a closed window leaves its subscriptions attached to module-level
        // state, which keeps the widget alive forever.
        onCleanup(() => {
          stop()
          teardown?.()
        })
      }}
    />
  )
}
