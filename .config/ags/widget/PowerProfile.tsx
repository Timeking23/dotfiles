import { Gtk } from "ags/gtk4"
import { createMemo, type Accessor } from "ags"

import { thermals } from "../state/thermal"
import { closePanel } from "../state/panel"
import {
  TIERS,
  activeProfile,
  curvesEnabled,
  curvesLabel,
  fanEditorNote,
  hasFanEditor,
  launchFanEditor,
  powerBinding,
  profileSettling,
  setCurves,
  setProfile,
  type Tier,
} from "../state/profile"

/**
 * The power panel.
 *
 * Styled flat rather than as brushed steel -- see `.SidePanel panelCase.flat`
 * in style/_power.scss and the class swap in SidebarPanel.tsx. This is the one
 * surface in the deck that is a settings page rather than an instrument, and
 * the bevels that make a gauge read as hardware make a list of choices read as
 * a 1998 control panel.
 *
 * Everything on it is live. The three cards are the kernel's platform_profile,
 * the tiles are hwmon, the switch is asusd's fan-curve state -- nothing here is
 * a static illustration of a setting, which is the rule the rest of the deck
 * follows too.
 */

/** Where a reading sits between idle and the point it stops being fine. */
function span(value: number | null, floor: number, ceiling: number): number {
  if (value === null) return 0
  return Math.min(1, Math.max(0, (value - floor) / (ceiling - floor)))
}

/**
 * One choice.
 *
 * A button, not a toggle: the selected state is not the button's own, it is
 * whatever the kernel says, arriving back through `activeProfile`. A GtkToggle
 * would hold a second copy of that and drift from it the moment the profile
 * changed from anywhere else -- the keybind, asusd's own AC/battery switch, or
 * unplugging the charger.
 */
function TierCard({ tier }: { tier: Tier }) {
  const selected = createMemo(() => activeProfile() === tier.key)
  const cls = createMemo(() => (selected() ? "pwrTier selected" : "pwrTier"))

  return (
    <button
      class={cls}
      hexpand
      valign={Gtk.Align.FILL}
      tooltipText={tier.blurb}
      onClicked={() => setProfile(tier.key)}
    >
      <box orientation={Gtk.Orientation.VERTICAL} cssName="pwrTierBody" spacing={0}>
        <box spacing={8}>
          <label cssName="pwrTierGlyph" label={tier.glyph} />
          {/* The dot is the only thing that moves when a card is picked, so it
              is what the eye tracks. Faded out rather than hidden when the card
              is not selected: `visible={false}` takes it out of the layout, and
              the row it shares with the glyph would change height as the
              selection moved between cards. */}
          <box hexpand />
          <label
            cssName="pwrTierDot"
            class={createMemo(() => (selected() ? "on" : ""))}
            label={"\u{f111}"} // nf-fa-circle
          />
        </box>
        <label cssName="pwrTierName" label={tier.label} xalign={0} />
        <label cssName="pwrTierBlurb" label={tier.blurb} xalign={0} wrap maxWidthChars={22} />
      </box>
    </button>
  )
}

/** One reading, as a figure over a fill bar. */
function Stat({
  label,
  value,
  unit,
  fraction,
  tone,
}: {
  label: string
  value: Accessor<string>
  unit: string
  fraction: Accessor<number>
  /** modifier class, so the fill can carry its own colour */
  tone: string
}) {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} cssName="pwrStat" hexpand spacing={0}>
      <label cssName="pwrStatLabel" label={label} xalign={0} />
      <box valign={Gtk.Align.BASELINE} spacing={2}>
        <label cssName="pwrStatValue" label={value} xalign={0} />
        <label cssName="pwrStatUnit" label={unit} />
      </box>
      {/* A LevelBar rather than a box whose width is set from an allocation:
          the fill is a real GTK node here, so it is styled from the stylesheet
          and needs no measuring pass to follow the panel's width. */}
      <levelbar
        class={`pwrStatBar ${tone}`}
        minValue={0}
        maxValue={1}
        value={fraction}
        hexpand
      />
    </box>
  )
}

export default function PowerProfile() {
  const cpu = createMemo(() => thermals().cpu)
  const gpu = createMemo(() => thermals().gpu)
  const rpm = createMemo(() => thermals().rpm)

  const text = (v: Accessor<number | null>) => createMemo(() => (v() === null ? "--" : `${v()}`))

  return (
    <box orientation={Gtk.Orientation.VERTICAL} cssName="pwrPanel" spacing={0}>
      {/* ---- the choice ---- */}
      <box cssName="pwrTiers" spacing={10} homogeneous>
        {TIERS.map((tier) => (
          <TierCard tier={tier} />
        ))}
      </box>

      {/* A status line under the cards rather than a spinner on the one you
          clicked: the write is to the whole machine, not to that card, and a
          per-card spinner implies the other two are still available. */}
      <label
        cssName="pwrStatus"
        xalign={0}
        label={createMemo(() => (profileSettling() ? "applying…" : powerBinding()))}
      />

      <box cssName="pwrRule" />

      {/* ---- what it is doing ---- */}
      <label cssName="pwrSectionLabel" label="TELEMETRY" xalign={0} />
      <box cssName="pwrStats" spacing={10} homogeneous>
        <Stat
          label="CPU"
          value={text(cpu)}
          unit="°C"
          // 95 is where this chip deliberately parks under load, so the bar is
          // scaled to it -- a gauge that reads full during normal boosting is
          // reporting the design, not a problem.
          fraction={createMemo(() => span(cpu(), 40, 95))}
          tone="hot"
        />
        <Stat
          label="GPU"
          value={text(gpu)}
          unit="°C"
          fraction={createMemo(() => span(gpu(), 40, 90))}
          tone="warm"
        />
        <Stat
          label="FANS"
          value={text(rpm)}
          unit="rpm"
          fraction={createMemo(() => span(rpm(), 0, 7800))}
          tone="cool"
        />
      </box>

      <box cssName="pwrRule" />

      {/* ---- the fan curve ---- */}
      <box cssName="pwrRow" spacing={12}>
        <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={2}>
          <label cssName="pwrRowTitle" label="Custom fan curve" xalign={0} />
          <label
            cssName="pwrRowNote"
            xalign={0}
            wrap
            label={createMemo(() =>
              curvesEnabled()
                ? "asusd is driving the fans from your curve for this profile."
                : "Firmware curve. On this machine it lets all three fans sit at 0 rpm while the package is at 95°C.",
            )}
          />
        </box>

        <box valign={Gtk.Align.CENTER} spacing={10}>
          <label cssName="pwrPill" label={curvesLabel} />
          {/* Hand-built rather than a GtkSwitch: a GtkSwitch carries its own
              `active` and animates to it on click, so it would flip under the
              pointer and then snap back four seconds later when asusd's poll
              disagreed. This one has no state -- the knob's alignment IS
              `curvesEnabled`. */}
          <button
            class={createMemo(() => (curvesEnabled() ? "pwrSwitch on" : "pwrSwitch"))}
            tooltipText="Enable or disable the custom fan curve for the active profile"
            onClicked={() => setCurves(!curvesEnabled.peek())}
          >
            <box cssName="pwrSwitchTrack" hexpand>
              {/* hexpand, or halign has nothing to align WITHIN: a box packs a
                  non-expanding child at the start and the knob sits on the left
                  whichever way the switch is thrown. It takes the full track
                  width and halign then places the 16px knob inside it. */}
              <box
                cssName="pwrSwitchKnob"
                hexpand
                halign={createMemo(() => (curvesEnabled() ? Gtk.Align.END : Gtk.Align.START))}
                valign={Gtk.Align.CENTER}
              />
            </box>
          </button>
        </box>
      </box>

      {/* ---- the curve itself ---- */}
      <box cssName="pwrRow" spacing={12}>
        <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={2}>
          <label cssName="pwrRowTitle" label="Curve editor" xalign={0} />
          <label cssName="pwrRowNote" xalign={0} wrap label={fanEditorNote} />
        </box>

        {/* Nothing custom behind this button -- it opens ROG Control Center,
            which ships with asusctl and speaks to the same daemon. The note in
            state/profile.ts says why that is better than drawing a curve
            editor here. */}
        <button
          class="pwrAction"
          valign={Gtk.Align.CENTER}
          sensitive={hasFanEditor}
          tooltipText={fanEditorNote}
          onClicked={() => {
            //  Shut the panel FIRST. This is an overlay layer surface holding
            //  an exclusive keymode, so the GUI would otherwise open behind a
            //  scrim it cannot be raised above or typed into.
            closePanel()
            launchFanEditor()
          }}
        >
          <label label="Open" />
        </button>
      </box>
    </box>
  )
}
