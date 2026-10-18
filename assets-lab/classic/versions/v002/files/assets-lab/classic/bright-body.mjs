/** Preserve the approved tile in idle; layer hold feedback without changing its shape. */
export function brightBodyState(source, state) {
  if (state === 'idle') return source;
  if (state === 'off') {
    const filter = '<defs><filter id="failed-material" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.45"/><feFuncG type="linear" slope="0.45"/><feFuncB type="linear" slope="0.45"/></feComponentTransfer></filter></defs>';
    return source.replace(/<image\b/, `${filter}<image filter="url(#failed-material)"`);
  }
  if (state !== 'on' && state !== 'partial-off') throw new Error(`Unknown bright body state: ${state}`);
  // Both layers are constant along Y, so every state repeats without a seam.
  const spill = state === 'on'
    ? '<defs><linearGradient id="held-spill"><stop stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><rect data-light="spill" x="180" width="640" height="200" fill="url(#held-spill)"/>'
    : '';
  const core = '<rect data-light="white" x="472" width="56" height="200" fill="#fcfeff"/>';
  return source.replace('</svg>', `<g data-layer="emission">${spill}${core}</g></svg>`);
}
