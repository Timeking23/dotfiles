# ryona's AGS shell

A desktop shell for Hyprland: top bar, sidebar drawer, system monitor,
filesystem graph, music player, weather panel, notifications and OSDs.

Built with **AGS 3** on **GTK 4** and **Astal**, in TypeScript with JSX.

---

## Start here

If you have never touched this stack, read these three things in order and
everything else will make sense:

1. **[Reactivity](#1-reactivity-accessors)** — the one idea the whole config rests on.
2. **[`widget/canvas.tsx`](widget/canvas.tsx)** — how the hand-drawn instruments work.
   It is written as a tutorial; read the comment at the top of the file.
3. **[`state/sysinfo.ts`](state/sysinfo.ts)** — a representative `state/` module,
   also commented as a walkthrough.

---

## The shape of the project

```
app.ts            entry point: opens every window, on every monitor
state/            where data comes from. No GTK, no widgets.
widget/           where data is shown. Reads state, never the reverse.
style/            Sass partials, one per area of the UI
style.scss        the default palette, compiled at build time
style-oxide.scss  alternate palettes, swapped live by the bar's palette button
@girs/            generated GObject typings. Regenerate with `ags types`. Not edited.
assets/           images, gif frames, and the Python scripts that generate them
```

**The one architectural rule:** `state/` never imports from `widget/`. Data flows
one way. That is what lets you understand any instrument on the bar by opening
exactly two files — the widget that draws it, and the state module it reads.

---

## 1. Reactivity: Accessors

Everything that changes over time is an `Accessor<T>` — a value that can tell
you when it changed. There are only a handful of ways to make one:

| Function | Use it for | Lazy? |
|---|---|---|
| `createState(v)` | a value *you* set. Returns `[accessor, setter]` | — |
| `createBinding(obj, "prop")` | a GObject property (Astal libraries, GTK widgets) | yes |
| `createConnection(init, [obj, "signal", fn], …)` | a value rebuilt on GObject signals | yes |
| `createPoll(init, ms, fn)` | something you must ask for on a timer | yes |
| `createSubprocess(init, argv, fn)` | lines coming out of a long-running process | yes |
| `createExternal(init, producer)` | anything else with a start/stop (file monitors, timers) | yes |
| `createMemo(() => …)` | a value derived from other accessors | yes |

**"Lazy" means the expensive part only runs while something is subscribed.** A
`createPoll` with no subscribers has no timer. This matters more than it sounds:
most windows in this config are hidden most of the time, and laziness is what
stops a hidden panel from walking `/proc` every three seconds.

Reading one:

```ts
cpuUsage()              // read, and subscribe if inside a memo/effect
cpuUsage.peek()         // read without subscribing
cpuUsage.subscribe(fn)  // run fn on change; returns an unsubscribe function
cpuUsage((v) => v * 100) // derive a new Accessor inline — handy in JSX props
```

### `createMemo`, not `createComputed`

Both derive a value. The difference is what happens when a dependency changes
but the *result* does not:

```ts
createComputed(() => `${Math.round(cpuUsage() * 100)}%`)  // notifies every second
createMemo(()     => `${Math.round(cpuUsage() * 100)}%`)  // notifies when the text changes
```

`cpuHistory` produces a new array every second, so the `createComputed` version
re-sets that label on the GTK widget once a second even while it reads "3%" for
minutes on end. **Prefer `createMemo` unless you specifically want the
notification.**

---

### GTK 4 only

This config is GTK 4 throughout, and there is no GTK 3 anywhere in it. Three
things enforce that, and all three have to agree:

- `tsconfig.json` sets `"jsxImportSource": "ags/gtk4"`, so `<box>` is a GTK 4 widget.
- Every widget imports from **`ags/gtk4`**, never `ags/gtk3`. That module is what
  pins `Astal 4.0`, `Gtk 4.0` and `Gdk 4.0` — importing from it is how you inherit
  the right versions without saying so.
- Direct `gi://` imports are **version-pinned** (`gi://Gdk?version=4.0`,
  `gi://Gsk?version=4.0`, …). `@girs/` ships both `gtk-3.0` and `gdk-3.0`
  typings, so a bare `gi://Gtk` is genuinely ambiguous — pin it.

To check what the running process actually loaded:

```bash
grep -o "Gtk-[0-9.]*\|Gdk-[0-9.]*" /proc/$(pgrep -x gjs)/maps | sort -u
```

## 2. Widgets and JSX

JSX here builds **GTK widgets**, not DOM. `<box>` is a `Gtk.Box`, `<label>` is a
`Gtk.Label`. Props are GObject properties in camelCase.

```tsx
<box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
  <label label={cpuLabel} />           {/* an Accessor: stays in sync by itself */}
  <label label="CPU" xalign={0} />     {/* a plain value: set once */}
</box>
```

Three things worth knowing:

- **`$={(self) => …}`** runs with the constructed widget. It is the escape hatch
  for anything JSX cannot express — adding gesture controllers, mostly.
- **`$type="start"`** positions a child in parents that have named slots
  (`<centerbox>`, `<overlay>`).
- **`<For each={accessor}>`** renders a list that updates in place, instead of
  rebuilding every row when one changes.

### Windows

Every top-level window is a layer-shell surface:

```tsx
<window
  name="bar"                                  // ags toggle -i ags bar
  anchor={TOP | LEFT | RIGHT}                 // which edges it sticks to
  exclusivity={Astal.Exclusivity.EXCLUSIVE}   // EXCLUSIVE reserves space; IGNORE overlaps
  layer={Astal.Layer.TOP}
  keymode={Astal.Keymode.NONE}                // NONE never takes keyboard focus
  application={app}
/>
```

`visible` can take an Accessor, which is how the system monitor and filesystem
graph show themselves on an empty workspace and hide the moment a window opens
there — see `desktopIsEmpty` in `state/system.ts`.

---

## 3. Hand-drawn widgets

The dials, sparkline, CPU crystal, memory mesh, filesystem graph, spotlights and
thermometer are not built from GTK widgets. They are blank rectangles painted
with Cairo.

All of them go through **[`widget/canvas.tsx`](widget/canvas.tsx)**, which owns
the lifecycle: subscribing to accessors, running a frame clock, repainting, and
— importantly — **stopping all of that when the widget is off screen**.

```tsx
<Canvas
  heightRequest={54}
  watch={[cpuHistory]}              // repaint when these change
  onChange={() => { … }}            // copy accessor values into plain locals
  animate={(dt) => { …; return true }}  // per frame; return true to repaint
  fps={20}                          // cap the repaint rate
  setup={(area) => { … }}           // gesture controllers
  draw={(cr, width, height) => { … }}
/>
```

`draw` is called by GTK outside any reactive scope, so it reads plain local
variables rather than accessors — that is what `onChange` is for.

### Animate on `dt`, never per frame

This machine runs at 144Hz. A phone-era laptop runs at 60. Anything of the form

```ts
shown += (target - shown) * 0.14   // ✗ eases 2.4x faster at 144Hz than at 60Hz
```

behaves differently on different hardware. Use a time constant instead:

```ts
shown += (target - shown) * (1 - Math.exp(-dt / EASE_TAU))   // ✓ same everywhere
```

---

## 4. Styling

Sass compiles at build time; `style.scss` imports the partials in `style/`.

Widgets are targeted two ways:

- `cssName="chassis"` sets the **element name** — matched as `chassis { … }`
- `class="Bar"` sets a **style class** — matched as `.Bar { … }`

GTK 4 CSS is not web CSS. It supports animations, `@keyframes` and blend modes;
it does **not** support `max-width`, `vh`/`vw` units, or most of the box model
you might expect. Check before assuming.

Palettes are a compile-time Sass variable, so they cannot be overridden at
runtime one property at a time. Instead the whole stylesheet is compiled once
per palette and swapped wholesale — see `widget/Palette.tsx`.

Anything drawn with Cairo cannot inherit CSS, so it reads `area.get_color()` and
watches `paletteIndex` to know when to look again.

---

## 5. Working on it

```bash
ags bundle . /tmp/out.js     # does it build?
npx tsc --noEmit             # does it typecheck? (see tsconfig.json)
ags types                    # regenerate @girs/ after installing a new Astal lib
```

**Restarting the shell.** `ags run` is only a wrapper; the process that matters
is `gjs`. Quit by instance name and start it the way Hyprland does:

```bash
ags quit -i ags
GSK_RENDERER=vulkan ags run
```

Do **not** `pkill -f "ags run"` — the pattern matches the shell you are typing
it into.

**Debugging a crash.** Check `coredumpctl` first. A `CReservedArea` crash means
an EXCLUSIVE layer surface ended up with zero size.

---

## Conventions

- **Every element maps to one live data source.** No decoration that does not
  say something. (`state/stickers.ts` is the one deliberate exception, and says
  so in its header.)
- **Guard every optional device.** No wifi card, no bluetooth adapter, no
  wireplumber — each is bound only if the object exists and read through `?.()`.
  A panel with a dead row beats a shell that will not start.
- **Comment the "why", not the "what".** Most comments here record a decision or
  a trap, not a description of the line below.
