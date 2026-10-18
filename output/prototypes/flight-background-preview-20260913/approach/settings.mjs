export function initialView(search, reducedMotion = false) {
  const params = new URLSearchParams(search);
  const scenario = params.get('variant') === 'infiltration' ? 'infiltration' : 'liftoff';
  const value = params.get('altitude');
  const altitude = value !== null && value !== '' && Number.isFinite(Number(value))
    ? Math.min(.95, Math.max(.03, Number(value)))
    : scenario === 'liftoff' ? .68 : .23;
  const running = params.has('paused') ? params.get('paused') !== '1' : !reducedMotion;
  return {scenario, altitude, running};
}
