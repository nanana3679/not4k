// Atlas layout of the gear button layers (prepare-gear-buttons-v22.mjs). Pure functions so the box math is testable.
//
// Crops are aligned to ALIGN gear pixels and placed at ALIGN-aligned atlas positions, so every mip level up to
// log2(ALIGN) covers the same gear pixels as the gear texture's own mip level (the layers are drawn over the gear at the
// same scale with the same trilinear filter). FRAME_GAP transparent pixels separate frames, so bilinear sampling just
// outside a frame reads transparency (like the transparent surroundings the layer has on the gear) and never a neighbour.

export const ALIGN = 16;
export const FRAME_GAP = 16;

/** The ALIGN-aligned box (x, y, width, height) around an inclusive pixel box { x0, y0, x1, y1 }. */
export function alignedCrop(box) {
  const x = Math.floor(box.x0 / ALIGN) * ALIGN;
  const y = Math.floor(box.y0 / ALIGN) * ALIGN;
  return {
    x,
    y,
    width: Math.ceil((box.x1 + 1) / ALIGN) * ALIGN - x,
    height: Math.ceil((box.y1 + 1) / ALIGN) * ALIGN - y,
  };
}

/**
 * Packs columns of crops left to right, each column top to bottom, with FRAME_GAP around and between frames.
 * A column is as wide as its widest crop. Returns the atlas size and each crop's atlas position (places[column][row]).
 */
export function packColumns(columns) {
  let left = FRAME_GAP;
  let height = 0;
  const places = columns.map((column) => {
    let top = FRAME_GAP;
    const placed = column.map((crop) => {
      const place = { atlasX: left, atlasY: top };
      top += crop.height + FRAME_GAP;
      return place;
    });
    height = Math.max(height, top);
    left += Math.max(...column.map((crop) => crop.width)) + FRAME_GAP;
    return placed;
  });
  return { width: left, height, places };
}
