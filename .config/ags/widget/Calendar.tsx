import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { For, createMemo, createState } from "ags"
import { createPoll } from "ags/time"

import {
  addNote,
  deleteNote,
  hasDone,
  notes,
  notionDetail,
  notionState,
  setNoteDone,
  startNotionSync,
  setRange,
  stopNotionSync,
  todayIso,
  ymd,
  type Note,
} from "../state/notion"

/**
 * Month calendar with the day's notes under it, backed by Notion.
 *
 * The notes half degrades rather than breaks: with no credentials on disk the
 * grid still works and the panel says what is missing, because a calendar that
 * refuses to show you February because a token is absent is a worse calendar
 * than one that shows you February.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]

type Cell = { day: number; iso: string } | null

/**
 * Six weeks of cells, Monday first, with the days either side of the month left
 * blank. Six rather than five because a 31-day month starting on a Sunday needs
 * the sixth, and a grid that changes height as you page through the year is
 * worse than one empty row.
 */
function monthCells(anchor: Date): Cell[] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()

  // getDay() counts from Sunday; this counts from Monday
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const length = new Date(year, month + 1, 0).getDate()

  const out: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const day = i - lead + 1
    out.push(day >= 1 && day <= length ? { day, iso: ymd(year, month + 1, day) } : null)
  }
  return out
}

/** so the calendar is pinned open from the bar as well as by a bare desktop */
export const [calendarPinned, setCalendarPinned] = createState(false)

export default function Calendar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT } = Astal.WindowAnchor

  // one reading of the clock, shared — see todayIso
  const start = todayIso()
  const [year, month] = start.split("-").map(Number)

  const [anchor, setAnchor] = createState(new Date(year, month - 1, 1))
  const [selected, setSelected] = createState(start)

  // rolls over on its own, so "today" is still today at 00:01
  const today = createPoll(start, 60_000, () => todayIso())

  const cells = createMemo(() => monthCells(anchor()))
  const marked = createMemo(() => new Set(notes().map((n) => n.date)))

  const heading = createMemo(() => {
    const d = anchor()
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  })

  const dayNotes = createMemo(() =>
    notes()
      .filter((n) => n.date === selected())
      .sort((a, b) => Number(a.done) - Number(b.done) || a.text.localeCompare(b.text)),
  )

  const dayLabel = createMemo(() => {
    const [y, m, d] = selected().split("-").map(Number)
    return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`
  })

  const footer = createMemo(() => {
    switch (notionState()) {
      case "unconfigured":
        return "notion: no token — see state/notion.json"
      case "loading":
        return "notion: connecting…"
      case "error":
        return `notion: ${notionDetail()}`
      default: {
        const n = notes().length
        return `notion: ${n} note${n === 1 ? "" : "s"}`
      }
    }
  })

  /** tell the sync which month is on screen, so it fetches only that */
  function syncRange() {
    const d = anchor()
    const y = d.getFullYear()
    const m = d.getMonth()
    setRange(ymd(y, m + 1, 1), ymd(y, m + 1, new Date(y, m + 1, 0).getDate()))
  }

  function shiftMonth(by: number) {
    const d = anchor()
    setAnchor(new Date(d.getFullYear(), d.getMonth() + by, 1))
    syncRange()
  }

  function Day({ at }: { at: number }) {
    let button: Gtk.Button | null = null

    return (
      <button
        hexpand
        $={(self: Gtk.Button) => {
          button = self
        }}
        class={createMemo(() => {
          const cell = cells()[at]
          if (!cell) return "day blank"

          const classes = ["day"]
          if (cell.iso === today()) classes.push("today")
          if (cell.iso === selected()) classes.push("selected")
          if (marked().has(cell.iso)) classes.push("marked")
          return classes.join(" ")
        })}
        sensitive={createMemo(() => !!cells()[at])}
        onClicked={() => {
          const cell = cells()[at]
          if (!cell || !button) return

          // clicking the open day again closes it
          if (notePopover.get_visible() && selected() === cell.iso) {
            notePopover.popdown()
            return
          }

          setSelected(cell.iso)

          // One popover, re-parented to whichever day was clicked, rather than
          // forty-two of them built up front. Unparent first: GTK4 refuses to
          // set a parent on a widget that already has one.
          notePopover.popdown()
          notePopover.unparent()
          notePopover.set_parent(button)
          notePopover.popup()
        }}
      >
        <label label={createMemo(() => `${cells()[at]?.day ?? ""}`)} />
      </button>
    )
  }

  /**
   * Never appended to the deck — it is parented to a day button on click and
   * lives outside the box tree the rest of the time.
   */
  const noteBody = (
    <box orientation={Gtk.Orientation.VERTICAL} cssName="calPopBody" spacing={6}>
      <label cssName="calNoteDate" label={dayLabel} xalign={0} />

      <box orientation={Gtk.Orientation.VERTICAL} cssName="calNotes" spacing={4}>
        <For each={dayNotes}>
          {(note: Note) => (
            <box cssName="calNote" spacing={5}>
              <button
                visible={hasDone}
                class={note.done ? "noteBox done" : "noteBox"}
                onClicked={() => setNoteDone(note.id, !note.done)}
              >
                <label label={note.done ? "×" : " "} />
              </button>
              <label
                cssName={note.done ? "calNoteTextDone" : "calNoteText"}
                label={note.text}
                xalign={0}
                wrap
                hexpand
              />
              <button class="noteDrop" onClicked={() => deleteNote(note.id)}>
                <label label="−" />
              </button>
            </box>
          )}
        </For>
      </box>

      <entry
        cssName="calEntry"
        placeholderText="add a note…"
        widthRequest={250}
        onActivate={(self: Gtk.Entry) => {
          const text = self.get_text()
          if (!text.trim()) return
          addNote(selected(), text)
          self.set_text("")
        }}
    />
    </box>
  ) as Gtk.Box

  const notePopover = (
    <popover
      class="calPop"
      // autohide popovers take an input grab to watch for the click that
      // dismisses them. On a layer-shell surface that grab is not reliably
      // granted, and a popover that cannot grab closes itself the instant it
      // opens — which looks exactly like a popover that never opened. So it is
      // dismissed explicitly instead: click the day again, or the ✕.
      autohide={false}
      hasArrow
      // set_child explicitly rather than letting the generic JSX appendChild
      // route a Popover child through vfunc_add_child — that path attaches
      // nothing here, and you get a popover that opens as a bare arrow
      $={(self: Gtk.Popover) => self.set_child(noteBody)}
    />
  ) as Gtk.Popover

  const deck = (
    <box orientation={Gtk.Orientation.VERTICAL} cssName="calDeck" widthRequest={260}>
      <box cssName="calHead">
        <button class="calNav" onClicked={() => shiftMonth(-1)}>
          <label label="‹" />
        </button>
        <label cssName="calMonth" label={heading} hexpand />
        <button class="calNav" onClicked={() => shiftMonth(1)}>
          <label label="›" />
        </button>
        <button
          class="calNav"
          onClicked={() => {
            const iso = todayIso()
            const [y, m] = iso.split("-").map(Number)
            setAnchor(new Date(y, m - 1, 1))
            setSelected(iso)
            syncRange()
          }}
        >
          <label label="TODAY" />
        </button>
      </box>

      <box cssName="calWeekdays" homogeneous>
        {WEEKDAYS.map((d) => (
          <label cssName="calWeekday" label={d} />
        ))}
      </box>

      <box orientation={Gtk.Orientation.VERTICAL} cssName="calGrid">
        {Array.from({ length: 6 }, (_, week) => (
          <box homogeneous>
            {Array.from({ length: 7 }, (_, weekday) => (
              <Day at={week * 7 + weekday} />
            ))}
          </box>
        ))}
      </box>

      <label cssName="calFooter" label={footer} xalign={0} wrap />

      <box
        $={(self: Gtk.Widget) => {
          // sync only while the calendar is actually on screen
          self.connect("map", () => {
            syncRange()
            startNotionSync()
          })
          self.connect("unmap", stopNotionSync)
          if (self.get_mapped()) startNotionSync()
        }}
      />
    </box>
  ) as Gtk.Box

  return (
    <window
      visible={createMemo(() => calendarPinned())}
      name="calendar"
      class="calendar"
      gdkmonitor={gdkmonitor}
      anchor={TOP | LEFT}
      marginTop={12}
      marginLeft={12}
      // NORMAL respects the bar's exclusive zone, so this lands under it rather
      // than behind it
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.TOP}
      // ON_DEMAND, unlike the wallpaper HUDs: the note entry needs a keyboard,
      // and it only takes focus once you click into it
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      {deck}
    </window>
  )
}
