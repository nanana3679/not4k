import { interpolatedPaletteTable, paletteMappedArtwork } from './release-palette.mjs';

// Sampled isolated-note anchors: periwinkle detail, cyan edge and pale lavender face.
// Darker extensions keep the existing body planes readable.
export const brightBlueStops = [
  [0, '#050b18'], [.15, '#344d83'], [.3, '#586db8'], [.4, '#8394f7'],
  [.6, '#96d8ff'], [.8, '#d2e4fe'], [.9, '#eae7fe'], [.96, '#e1f0fe'], [1, '#ffffff'],
];

export function brightBlueArtwork(source, { width = 200, height = 40, amount = 1 } = {}) {
  return paletteMappedArtwork(source, interpolatedPaletteTable(brightBlueStops), { width, height, amount })
    // A stroke can extend beyond the fill bounds. Keep the whole asset canvas in the filter.
    .replace('id="release-palette" x="0" y="0" width="100%" height="100%"', `id="bright-blue-palette" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"`)
    .replace('filter="url(#release-palette)"', 'filter="url(#bright-blue-palette)"');
}
