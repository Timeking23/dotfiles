/**
 * ============================================================================
 * Bento packing -- tiles of different sizes, packed into rows
 * ============================================================================
 *
 * One row of full-height columns stops working at about six workspaces: on a
 * 1440px board, ten of them are 130px wide each, which is narrower than a
 * single window thumbnail. So the board wraps into rows -- and once it wraps,
 * there is no reason every tile should be the same size.
 *
 * SIZE ENCODES HOW MUCH IS ON THE WORKSPACE. A workspace with four windows is
 * genuinely more worth looking at than an empty one, and giving them identical
 * tiles spends the same space saying both things. This is the bento idea: the
 * tile's footprint carries the hierarchy so no label has to.
 *
 * The packer is a plain skyline/shelf fill: walk the tiles in workspace order
 * and drop each into the first cell it fits. Order is preserved because the
 * arrow keys navigate by it -- a packer that reordered tiles to get a tighter
 * fit would make Left and Right jump around the screen unpredictably.
 */

export type Tile = {
  /** grid column, 0-based */
  col: number
  /** grid row, 0-based */
  row: number
  colSpan: number
  rowSpan: number
}

/**
 * How many base cells wide the board is.
 *
 * Six divides cleanly by the 1, 2 and 3 spans below, so a row can be filled
 * exactly by 6x1, 3x2, 2x3 or a mix -- no ragged half-cell left over.
 *
 * The Gtk.Grid this feeds is set columnHomogeneous/rowHomogeneous, which is
 * load-bearing: by default Gtk.Grid sizes each column to its own content, so
 * "spans 2 columns" meant different pixel widths in different places and tiles
 * of supposedly equal span came out visibly different sizes. A bento only reads
 * as a bento if the base cell is constant.
 */
export const COLS = 6

/**
 * Footprint for a workspace holding `count` windows.
 *
 * Deliberately coarse. Five sizes would encode the count more precisely and
 * read as noise; these three are distinguishable at a glance across the room,
 * which is the only resolution a spatial cue like this actually has.
 */
export function spanFor(count: number): { colSpan: number; rowSpan: number } {
  if (count >= 4) return { colSpan: 3, rowSpan: 2 } // a busy workspace
  if (count >= 2) return { colSpan: 2, rowSpan: 2 } // a working one
  return { colSpan: 2, rowSpan: 1 } //                 one window, or empty
}

/**
 * Place every tile, in order, into the first cell it fits.
 *
 * `occupied` is a set of "row,col" strings rather than a 2D array because the
 * board has no height limit -- it grows downwards as far as it needs to, and a
 * preallocated grid would have to guess how far that is.
 */
export function packBento(counts: number[]): Tile[] {
  const occupied = new Set<string>()
  const tiles: Tile[] = []

  const free = (row: number, col: number, w: number, h: number): boolean => {
    if (col + w > COLS) return false
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (occupied.has(`${r},${c}`)) return false
      }
    }
    return true
  }

  const take = (row: number, col: number, w: number, h: number) => {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) occupied.add(`${r},${c}`)
    }
  }

  for (const count of counts) {
    const { colSpan, rowSpan } = spanFor(count)

    let placed = false
    //  Scan downwards. The bound is generous rather than exact: worst case is
    //  one tile per row, so the tile index is always a safe ceiling.
    for (let row = 0; row < counts.length + 2 && !placed; row++) {
      for (let col = 0; col < COLS && !placed; col++) {
        if (!free(row, col, colSpan, rowSpan)) continue
        take(row, col, colSpan, rowSpan)
        tiles.push({ col, row, colSpan, rowSpan })
        placed = true
      }
    }

    //  Cannot happen with the spans above (all fit in COLS), but a future span
    //  wider than the board would silently drop a workspace off the screen.
    if (!placed) tiles.push({ col: 0, row: counts.length + 2, colSpan, rowSpan })
  }

  return tiles
}
