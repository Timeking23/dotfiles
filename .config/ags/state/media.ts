import AstalMpris from "gi://AstalMpris"
import { createBinding, createMemo } from "ags"
import { createPoll } from "ags/time"

export const spotify = AstalMpris.Player.new("spotify")

export const title = createBinding(spotify, "title")
export const artist = createBinding(spotify, "artist")
export const album = createBinding(spotify, "album")
export const coverArt = createBinding(spotify, "coverArt")
export const playbackStatus = createBinding(spotify, "playbackStatus")
export const loopStatus = createBinding(spotify, "loopStatus")
export const shuffleStatus = createBinding(spotify, "shuffleStatus")

export const canGoNext = createBinding(spotify, "canGoNext")
export const canGoPrevious = createBinding(spotify, "canGoPrevious")
export const canPlay = createBinding(spotify, "canPlay")
export const canSeek = createBinding(spotify, "canSeek")

export const isPlaying = createMemo(
  () => playbackStatus() === AstalMpris.PlaybackStatus.PLAYING,
)

/** "Artist — Album", collapsing gracefully when either is missing */
export const subtitle = createMemo(() =>
  [artist(), album()].filter(Boolean).join("  —  "),
)

export const shuffleIcon = "media-playlist-shuffle-symbolic"

export const shuffleClass = createMemo(() =>
  shuffleStatus() === AstalMpris.Shuffle.ON ? "toggle active" : "toggle",
)

export const loopIcon = createMemo(() =>
  loopStatus() === AstalMpris.Loop.TRACK
    ? "media-playlist-repeat-song-symbolic"
    : "media-playlist-repeat-symbolic",
)

export const loopClass = createMemo(() => {
  const status = loopStatus()
  const on = status === AstalMpris.Loop.TRACK || status === AstalMpris.Loop.PLAYLIST
  return on ? "toggle active" : "toggle"
})

/** seconds, float */
export const length = createBinding(spotify, "length")

/** position has no change signal on MPRIS, so it has to be polled */
export const position = createPoll(0, 1000, () => spotify.position)

export const statusLabel = createMemo(() => {
  switch (playbackStatus()) {
    case AstalMpris.PlaybackStatus.PLAYING:
      return "PLAYING"
    case AstalMpris.PlaybackStatus.PAUSED:
      return "PAUSED"
    default:
      return "STOPPED"
  }
})

/** Zero-padded so the counter never reflows as digits change width. */
export function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00"

  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`
}

export const elapsed = createMemo(() => formatTime(position()))
export const duration = createMemo(() => formatTime(length()))

export const progressPercent = createMemo(() => {
  const total = length()
  if (!total || total <= 0) return "--%"

  const percent = Math.min(100, Math.max(0, Math.round((position() / total) * 100)))
  return `${percent.toString().padStart(2, "0")}%`
})
