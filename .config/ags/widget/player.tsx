import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import Pango from "gi://Pango?version=1.0"

import {
  canGoNext,
  canGoPrevious,
  canPlay,
  canSeek,
  coverArt,
  duration,
  elapsed,
  isPlaying,
  length,
  loopClass,
  loopIcon,
  position,
  progressPercent,
  shuffleClass,
  shuffleIcon,
  spotify,
  statusLabel,
  subtitle,
  title,
} from "../state/media"
import Spotlights from "./Spotlights"

const COVER = 236

/** A bolted-on plate in one of the side rails. */
function Tile({
  icon,
  onClicked,
  sensitive,
  cls,
}: {
  icon: any
  onClicked: () => void
  sensitive?: any
  cls?: any
}) {
  return (
    <button class={cls ?? "tile"} sensitive={sensitive} onClicked={onClicked}>
      <image iconName={icon} pixelSize={15} />
    </button>
  )
}

export default function player(gdkmonitor: Gdk.Monitor) {
  const { TOP } = Astal.WindowAnchor

  return (
    <window
      visible={false}
      name="player"
      class="player"
      gdkmonitor={gdkmonitor}
      anchor={TOP}
      marginTop={12}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <overlay>
      <box orientation={Gtk.Orientation.VERTICAL} cssName="chassis" widthRequest={352}>
        {/* header plate — recessed strip across the top of the casing */}
        <box cssName="headerPlate">
          <label
            cssName="headerTitle"
            label={title}
            xalign={0}
            hexpand
            maxWidthChars={24}
            ellipsize={Pango.EllipsizeMode.END}
          />
          <label cssName="headerStatus" label={statusLabel} />
        </box>

        <box cssName="mainRow" spacing={6}>
          {/* left rail: playback modes */}
          <box orientation={Gtk.Orientation.VERTICAL} cssName="rail" spacing={6}>
            <Tile icon={shuffleIcon} cls={shuffleClass} onClicked={() => spotify.shuffle()} />
            <Tile icon={loopIcon} cls={loopClass} onClicked={() => spotify.loop()} />
            <box vexpand cssName="railFill" />
          </box>

          {/* the screen */}
          <box orientation={Gtk.Orientation.VERTICAL} cssName="screenHousing">
            <overlay cssName="screen">
              <image file={coverArt} pixelSize={COVER} cssName="coverArt" />
              <Spotlights $type="overlay" size={COVER} />
            </overlay>
            <label
              cssName="screenCaption"
              label={subtitle}
              xalign={0}
              maxWidthChars={30}
              ellipsize={Pango.EllipsizeMode.END}
            />
          </box>

          {/* right rail: transport */}
          <box orientation={Gtk.Orientation.VERTICAL} cssName="rail" spacing={6}>
            <Tile
              icon="media-skip-backward-symbolic"
              sensitive={canGoPrevious}
              onClicked={() => spotify.previous()}
            />
            <Tile
              icon="media-skip-forward-symbolic"
              sensitive={canGoNext}
              onClicked={() => spotify.next()}
            />
            <box vexpand cssName="railFill" />
          </box>
        </box>

        {/* bottom deck: meter plate + transport plate */}
        <box cssName="bottomRow" spacing={6}>
          <box orientation={Gtk.Orientation.VERTICAL} cssName="meterPlate" hexpand>
            <slider
              hexpand
              cssName="progressBar"
              sensitive={canSeek}
              min={0}
              max={length((seconds) => (seconds > 0 ? seconds : 1))}
              value={position}
              // change-value is (self, scrollType, newValue) — reading self.value
              // here would hand back the *old* position, and value-changed would
              // fight the binding on every poll tick.
              onChangeValue={(_self, _scrollType, value: number) => {
                spotify.set_position(value)
                return false
              }}
            />
            <box cssName="counterRow">
              <label cssName="counter" label={elapsed} />
              <box hexpand />
              <label cssName="counterDim" label={progressPercent} />
              <box hexpand />
              <label cssName="counter" label={duration} />
            </box>
          </box>

          <button class="playPlate" sensitive={canPlay} onClicked={() => spotify.play_pause()}>
            <image
              pixelSize={22}
              iconName={isPlaying((playing) =>
                playing ? "media-playback-pause-symbolic" : "media-playback-start-symbolic",
              )}
            />
          </button>
        </box>
      </box>
      </overlay>
    </window>
  )
}
