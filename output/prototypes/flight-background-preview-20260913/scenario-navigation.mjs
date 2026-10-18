export const scenarioNames = {liftoff:'이륙', infiltration:'침투', breakthrough:'돌파'};

export function currentScenario(view, search) {
  if (view !== 'approach') return 'breakthrough';
  return new URLSearchParams(search).get('variant') === 'infiltration' ? 'infiltration' : 'liftoff';
}

export function scenarioHref(base, scenario, savedSearch = '') {
  const key = Object.hasOwn(scenarioNames, scenario) ? scenario : 'breakthrough';
  const url = new URL(key === 'breakthrough' ? './' : 'approach/', base);
  url.search = savedSearch.startsWith('?') ? savedSearch : '';
  if (key !== 'breakthrough') url.searchParams.set('variant', key);
  return url.href;
}

export function setupScenarioNavigation() {
  const view = document.body.dataset.flightView;
  const selected = currentScenario(view, location.search);
  const base = new URL(view === 'approach' ? '../' : './', location.href);
  const prefix = `flight-preview:${base.pathname}:`;
  const links = [...document.querySelectorAll('a[data-scenario]')];
  const read = key => {try {return sessionStorage.getItem(prefix + key) || '';} catch {return '';}};
  const remember = () => {try {sessionStorage.setItem(prefix + selected, location.search);} catch {}};
  for (const link of links) {
    const key = link.dataset.scenario;
    link.href = scenarioHref(base, key, read(key));
    if (key === selected) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', () => {
      remember();
      link.href = scenarioHref(base, key, read(key));
    });
  }
  document.title = `not4k · ${scenarioNames[selected]} · 가로 비행 시연`;
  document.body.dataset.scenario = selected;
  window.addEventListener('pagehide', remember);
}

if (typeof document !== 'undefined') setupScenarioNavigation();
