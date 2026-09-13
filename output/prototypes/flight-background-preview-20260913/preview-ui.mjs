export const sceneLabels = Object.freeze({
  liftoff: 'LIFTOFF',
  infiltration: 'INFILTRATION',
  breakthrough: 'BREAKTHROUGH',
});

export const sliderIds = Object.freeze({
  liftoff: Object.freeze(['altitude']),
  infiltration: Object.freeze(['altitude']),
  breakthrough: Object.freeze(['altitude']),
});

export const breakthroughDefaults = Object.freeze({
  backdropBrightness: 10,
});

const sliderRail = `
  accent-color:#aab8c9;
  appearance:auto;
  background:transparent;
  border:0;
  cursor:pointer;
  height:44px;
  margin:0;
  min-height:44px;
  width:100%;
`;

export const approachStyle = `<style id="public-preview-controls">
  html,body{height:100%;overflow:hidden;background:#030711}
  html body{padding:0}
  html body>main{display:grid;grid-template-rows:minmax(0,1fr) auto;height:100%;max-width:none;margin:0;padding:0}
  html body[data-flight-view="approach"]>main{max-width:none;padding:0}
  html body header,html body .scenario-bar,html body .caption,html body .stage-tools,html body .stamp,html body .loading,html body .object-dock,html body footer{display:none}
  html body .stage{border:0;border-radius:0;height:auto;min-height:0;max-height:none;aspect-ratio:auto}
  html body #controls{display:block;background:#080d15;border-top:1px solid #1c2634;columns:auto;column-gap:0;padding:6px 18px 8px}
  html body:not(.scene-only) #controls{columns:auto;column-gap:0}
  html body #controls>*{display:none}
  html body #controls>.adjust{display:block;border:0;padding:0}
  html body #controls>.adjust>div{display:none}
  html body #controls>.adjust>div:has(#altitude){display:block;width:100%}
  html body #controls .control-title{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  html body #controls .range-caption,html body #controls .alt-controls{display:none}
  #altitude{${sliderRail}}
</style>`;

export const breakthroughStyle = `<style id="public-preview-controls">
  html,body{height:100%;overflow:hidden;background:#030711}
  html body>main{display:grid;grid-template-rows:minmax(0,1fr) auto;height:100%;max-width:none;margin:0;padding:0}
  html body>main>header,html body .hud,html body #loading,html body footer{display:none}
  html body .viewer{border:0;border-radius:0;height:auto;min-height:0;aspect-ratio:auto}
  html body .controls{display:grid;gap:2px;background:#080d15;border-top:1px solid #1c2634;padding:6px 18px 8px}
  html body .controls>*{display:none}
  html body .controls>.grid:has(#altitude){display:block;margin:0;order:1}
  html body .controls>.grid:has(#altitude)>label{display:none}
  html body .controls>.grid:has(#altitude)>label:has(#altitude){display:block;font-size:0;color:transparent}
  html body #altitude-value{display:none}
  #altitude{${sliderRail}}
</style>`;

export function frameStyle(view) {
  return view === 'breakthrough' ? breakthroughStyle : approachStyle;
}

export function publicPreviewPage(views) {
  const buttons = Object.entries(sceneLabels)
    .map(([view, label], index) => `<button type="button" data-view="${view}" aria-selected="${index === 0}">${label}</button>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark">
    <title>not4k · Flight Preview</title>
    <style>
      :root { color: #dbe5f2; background: #05070b; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; overflow: hidden; }
      body { display: grid; grid-template-rows: 54px minmax(0, 1fr); background: #05070b; }
      header { display: grid; place-items: center; padding: 6px 12px; border-bottom: 1px solid #202a38; background: #080d15; }
      nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; width: min(560px, 100%); }
      button { min-width: 0; min-height: 42px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: #8491a3; font: 650 12px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .08em; cursor: pointer; }
      button:hover { color: #cbd6e4; background: #111925; }
      button[aria-selected="true"] { color: #f1f6fc; background: #182230; }
      button:focus-visible { outline: 2px solid #aab8c9; outline-offset: -2px; }
      .stage { position: relative; min-height: 0; }
      iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #030711; }
      @media (max-width: 560px) {
        body { grid-template-rows: 50px minmax(0, 1fr); }
        header { padding: 4px 6px; }
        button { min-height: 42px; padding: 0 5px; font-size: 10px; letter-spacing: .04em; }
      }
    </style>
  </head>
  <body>
    <header>
      <nav aria-label="Flight scenes">${buttons}</nav>
    </header>
    <main class="stage">
      <iframe id="preview-frame" title="Flight preview" allow="fullscreen"></iframe>
    </main>
    <script>
      const sources = ${JSON.stringify(views)};
      const labels = ${JSON.stringify(sceneLabels)};
      const buttons = [...document.querySelectorAll('button[data-view]')];
      const frame = document.querySelector('#preview-frame');
      const params = new URLSearchParams(location.search);
      const requested = params.get('view');
      const initial = Object.hasOwn(sources, requested) ? requested : 'liftoff';
      let current = null;
      function rememberCurrentView() {
        if (!current || !frame.hasAttribute('src')) return;
        try {
          const url = new URL(frame.contentWindow.location.href);
          if (url.origin === location.origin && url.pathname.startsWith('/flight/')) sources[current] = url.pathname + url.search;
        } catch {}
      }
      function select(view) {
        if (view === current) return;
        rememberCurrentView();
        for (const button of buttons) button.setAttribute('aria-selected', String(button.dataset.view === view));
        frame.dataset.view = view;
        frame.title = labels[view] + ' preview';
        frame.src = sources[view];
        current = view;
        const url = new URL(location.href);
        url.searchParams.set('view', view);
        url.searchParams.delete('trail');
        history.replaceState(null, '', url);
      }
      for (const button of buttons) button.addEventListener('click', () => select(button.dataset.view));
      select(initial);
    </script>
  </body>
</html>`;
}
