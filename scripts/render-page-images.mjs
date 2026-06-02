import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'public/page-images');
const gearPath = path.join(rootDir, 'gear.png');

const WIDTH = 1600;
const HEIGHT = 900;

const gearData = await readFile(gearPath, 'base64');
const gearSrc = `data:image/png;base64,${gearData}`;

const pages = [
  { id: 'title', accent: '#6eeeff', second: '#f05ccc', beam: 'quiet-gate' },
  { id: 'preset-setup', accent: '#74e8ff', second: '#e15fb9', beam: 'preset' },
  { id: 'song-select', accent: '#60ddff', second: '#dc5fd0', beam: 'song-select' },
  { id: 'loading', accent: '#6eeeff', second: '#cf5fe6', beam: 'loading' },
  { id: 'play', accent: '#6eeeff', second: '#c95aff', beam: 'play' },
  { id: 'result', accent: '#7eeeff', second: '#f05ccc', beam: 'result' },
  { id: 'settings', accent: '#65d8ff', second: '#d560c9', beam: 'settings' },
  { id: 'calibration', accent: '#75eeff', second: '#e767ba', beam: 'calibration' },
  { id: 'mobile-song-list', accent: '#60ddff', second: '#dc5fd0', beam: 'mobile-song-list' },
];

function chromePanels() {
  return `
    <svg class="chrome" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
      <defs>
        <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1b1725"/>
          <stop offset="0.48" stop-color="#4a3a5e"/>
          <stop offset="1" stop-color="#14111a"/>
        </linearGradient>
        <linearGradient id="edgeGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--accent)" stop-opacity="0"/>
          <stop offset="0.5" stop-color="var(--accent)" stop-opacity="0.95"/>
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <rect width="${WIDTH}" height="${HEIGHT}" fill="#060509"/>
      <path d="M0 0H1600V900H0Z" fill="url(#bgNoise)"/>

      <path d="M0 0h320l-88 92H0Z" fill="url(#metal)" opacity=".72"/>
      <path d="M1600 0h-320l88 92h232Z" fill="url(#metal)" opacity=".72"/>
      <path d="M0 900h378l-72-96H0Z" fill="url(#metal)" opacity=".78"/>
      <path d="M1600 900h-378l72-96h306Z" fill="url(#metal)" opacity=".78"/>
      <path d="M230 24h1140l-58 46H288Z" fill="#17131f" stroke="#59456f" stroke-width="2"/>
      <path d="M182 826h1236l-78 46H260Z" fill="#17131f" stroke="#59456f" stroke-width="2"/>

      <path d="M96 100h106l34 48v596l-34 48H96Z" fill="#17131f" stroke="#514067" stroke-width="2" opacity=".9"/>
      <path d="M1398 100h106v692h-106l-34-48V148Z" fill="#17131f" stroke="#514067" stroke-width="2" opacity=".9"/>
      <rect x="128" y="174" width="26" height="410" rx="13" fill="var(--accent)" opacity=".92"/>
      <rect x="1446" y="174" width="26" height="410" rx="13" fill="var(--accent)" opacity=".92"/>
      <rect x="164" y="220" width="16" height="242" rx="8" fill="var(--second)" opacity=".6"/>
      <rect x="1420" y="220" width="16" height="242" rx="8" fill="var(--second)" opacity=".6"/>

      <rect x="400" y="806" width="800" height="8" rx="4" fill="url(#edgeGlow)"/>
      <rect x="510" y="82" width="580" height="5" rx="3" fill="url(#edgeGlow)" opacity=".72"/>
      <rect x="702" y="818" width="196" height="38" rx="19" fill="#111018" stroke="#4e3b66" stroke-width="2"/>
      <circle cx="800" cy="837" r="20" fill="#101018" stroke="var(--accent)" stroke-width="4"/>
      <circle cx="800" cy="837" r="8" fill="var(--accent)" opacity=".92"/>
    </svg>
  `;
}

function plate(x, y, w, h, r = 12) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#090810" stroke="#483a5d" stroke-width="2"/>`;
}

function glowLine(x1, y1, x2, y2, color = 'var(--accent)', width = 4, opacity = 0.75) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

function pageLayer(page) {
  switch (page.beam) {
    case 'quiet-gate':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(462, 170, 676, 456, 24)}
          <path d="M548 626h504l-54 72H602Z" fill="#0c0b12" stroke="#4b3b5f" stroke-width="2"/>
          ${glowLine(552, 626, 1048, 626, 'var(--accent)', 3, .72)}
          ${glowLine(635, 696, 965, 696, 'var(--second)', 3, .46)}
          <circle cx="800" cy="428" r="90" fill="none" stroke="var(--accent)" stroke-width="2" opacity=".24"/>
          <circle cx="800" cy="428" r="46" fill="#07060b" stroke="var(--second)" stroke-width="2" opacity=".36"/>
        </svg>
      `;
    case 'preset':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(338, 476, 360, 168, 14)}
          ${plate(902, 476, 360, 168, 14)}
          ${keys(376, 508, 7, 3, 38, 28)}
          ${keys(956, 510, 4, 3, 42, 30)}
          ${keys(1144, 510, 2, 3, 46, 30)}
          ${glowLine(414, 662, 650, 662, 'var(--accent)', 3, .62)}
          ${glowLine(942, 662, 1220, 662, 'var(--accent)', 3, .62)}
          ${plate(574, 236, 452, 112, 18)}
          ${glowLine(628, 310, 972, 310, 'var(--second)', 3, .48)}
        </svg>
      `;
    case 'song-select':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(278, 214, 358, 358, 20)}
          <rect x="312" y="248" width="290" height="290" rx="12" fill="#05050a" stroke="var(--accent)" stroke-width="2" opacity=".58"/>
          <circle cx="457" cy="393" r="74" fill="none" stroke="var(--second)" stroke-width="3" opacity=".36"/>
          ${songSlots(780, 204, 5, 94)}
          ${songSlots(1062, 204, 5, 94)}
          ${glowLine(274, 610, 1326, 610, 'var(--accent)', 3, .38)}
          ${glowLine(692, 126, 1130, 126, 'var(--second)', 2, .32)}
        </svg>
      `;
    case 'loading':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(350, 282, 900, 260, 26)}
          <rect x="450" y="392" width="700" height="32" rx="16" fill="#08070d" stroke="#413450" stroke-width="2"/>
          ${glowLine(486, 408, 720, 408, 'var(--accent)', 6, .9)}
          ${glowLine(742, 408, 858, 408, 'var(--accent)', 6, .34)}
          ${glowLine(886, 408, 1110, 408, 'var(--second)', 6, .42)}
          ${dots(520, 475, 18, 18)}
          ${dots(906, 475, 18, 18)}
        </svg>
      `;
    case 'play':
      return `
        <svg class="art play-art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          <path d="M558 112h484l214 704H344Z" fill="#040408" stroke="#2a2335" stroke-width="2"/>
          ${glowLine(560, 112, 344, 816, 'var(--accent)', 3, .42)}
          ${glowLine(1040, 112, 1256, 816, 'var(--accent)', 3, .42)}
          ${glowLine(680, 112, 608, 816, 'var(--accent)', 2, .58)}
          ${glowLine(800, 112, 800, 816, 'var(--accent)', 2, .72)}
          ${glowLine(920, 112, 992, 816, 'var(--accent)', 2, .58)}
          ${glowLine(372, 744, 1228, 744, 'var(--second)', 5, .72)}
          <rect x="388" y="754" width="824" height="34" rx="12" fill="#0a0810" stroke="#58416d" stroke-width="2"/>
        </svg>
      `;
    case 'result':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(536, 196, 528, 376, 22)}
          <path d="M640 602h320l80 76H560Z" fill="#0b0911" stroke="#4b3a60" stroke-width="2"/>
          <ellipse cx="800" cy="610" rx="178" ry="36" fill="none" stroke="var(--accent)" stroke-width="3" opacity=".62"/>
          ${glowLine(650, 248, 950, 248, 'var(--accent)', 3, .48)}
          ${glowLine(706, 676, 894, 676, 'var(--second)', 4, .5)}
          ${sparkles()}
        </svg>
      `;
    case 'settings':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(430, 142, 740, 572, 18)}
          ${settingsRows(486, 188)}
          ${settingsControls(254, 196)}
          ${settingsControls(1246, 196)}
          ${glowLine(540, 724, 1060, 724, 'var(--accent)', 3, .34)}
        </svg>
      `;
    case 'calibration':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(516, 132, 568, 618, 24)}
          ${glowLine(590, 634, 1010, 634, 'var(--accent)', 4, .78)}
          <circle cx="800" cy="410" r="132" fill="none" stroke="var(--accent)" stroke-width="2" opacity=".2"/>
          <circle cx="800" cy="410" r="78" fill="none" stroke="var(--second)" stroke-width="2" opacity=".34"/>
          <rect x="674" y="364" width="252" height="24" rx="12" fill="#0c0a12" stroke="var(--second)" stroke-width="2"/>
          ${glowLine(740, 364, 860, 388, 'var(--second)', 3, .56)}
          ${calibrationTicks()}
        </svg>
      `;
    case 'mobile-song-list':
      return `
        <svg class="art" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
          ${plate(580, 110, 440, 682, 26)}
          ${songSlots(624, 166, 7, 76)}
          ${glowLine(616, 828, 984, 828, 'var(--accent)', 3, .48)}
          <rect x="548" y="84" width="504" height="736" rx="34" fill="none" stroke="#514067" stroke-width="2" opacity=".82"/>
        </svg>
      `;
  }
}

function keys(x, y, cols, rows, w, h) {
  let out = '';
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const px = x + col * (w + 10) + (row === 1 ? 12 : 0);
      const py = y + row * (h + 12);
      out += `<rect x="${px}" y="${py}" width="${w}" height="${h}" rx="6" fill="#14111c" stroke="var(--accent)" stroke-width="1.5" opacity=".68"/>`;
    }
  }
  return out;
}

function songSlots(x, y, rows, gap) {
  let out = '';
  for (let i = 0; i < rows; i += 1) {
    const yy = y + i * gap;
    out += `<rect x="${x}" y="${yy}" width="206" height="52" rx="10" fill="#090810" stroke="#4a3a5f" stroke-width="2"/>`;
    out += `<rect x="${x + 18}" y="${yy + 23}" width="170" height="4" rx="2" fill="var(--accent)" opacity="${i === 1 ? '.72' : '.32'}"/>`;
  }
  return out;
}

function dots(x, y, count, gap) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += `<circle cx="${x + i * gap}" cy="${y + Math.sin(i * .8) * 14}" r="2.2" fill="${i % 3 === 0 ? 'var(--second)' : 'var(--accent)'}" opacity=".48"/>`;
  }
  return out;
}

function sparkles() {
  const pts = [
    [454, 260], [496, 390], [1124, 314], [1088, 472], [402, 530],
    [1196, 546], [650, 172], [964, 176], [740, 622], [886, 620],
  ];
  return pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 3 : 2}" fill="${i % 2 ? 'var(--accent)' : 'var(--second)'}" opacity=".42"/>`).join('');
}

function settingsRows(x, y) {
  let out = '';
  for (let i = 0; i < 5; i += 1) {
    const yy = y + i * 88;
    out += `<rect x="${x}" y="${yy}" width="628" height="58" rx="9" fill="#07060c" stroke="#3e314f" stroke-width="2"/>`;
    out += `<rect x="${x + 30}" y="${yy + 26}" width="${280 + i * 34}" height="4" rx="2" fill="${i % 2 ? 'var(--second)' : 'var(--accent)'}" opacity=".38"/>`;
  }
  return out;
}

function settingsControls(x, y) {
  let out = plate(x, y, 164, 318, 12);
  for (let i = 0; i < 4; i += 1) {
    out += `<rect x="${x + 38 + i * 26}" y="${y + 48}" width="8" height="148" rx="4" fill="#07060c" stroke="#403250" stroke-width="1.5"/>`;
    out += `<rect x="${x + 34 + i * 26}" y="${y + 108 + i * 12}" width="16" height="22" rx="4" fill="var(--second)" opacity=".62"/>`;
  }
  for (let i = 0; i < 4; i += 1) {
    out += `<rect x="${x + 34 + (i % 2) * 60}" y="${y + 232 + Math.floor(i / 2) * 46}" width="42" height="22" rx="7" fill="#12101a" stroke="var(--accent)" stroke-width="1.5" opacity=".58"/>`;
  }
  return out;
}

function calibrationTicks() {
  let out = '';
  for (let i = 0; i < 9; i += 1) {
    const x = 604 + i * 49;
    const h = i === 4 ? 46 : 24;
    out += `<line x1="${x}" y1="${634 - h / 2}" x2="${x}" y2="${634 + h / 2}" stroke="${i === 4 ? 'var(--second)' : '#4a3a5e'}" stroke-width="${i === 4 ? 4 : 2}" stroke-linecap="round"/>`;
  }
  return out;
}

function html(page) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #060509; }
        body { font-family: system-ui, sans-serif; }
        .stage {
          --accent: ${page.accent};
          --second: ${page.second};
          position: relative;
          width: ${WIDTH}px;
          height: ${HEIGHT}px;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 56%, rgba(42, 30, 58, .38), rgba(5, 4, 8, .86) 48%, #030306 78%),
            linear-gradient(180deg, #090712 0%, #040306 100%);
        }
        .stage::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(116,238,255,.08), transparent 18%, transparent 82%, rgba(222,88,198,.08)),
            repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 6px);
          opacity: .38;
        }
        .stage::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, transparent 42%, rgba(0,0,0,.38) 76%, rgba(0,0,0,.72) 100%);
          pointer-events: none;
        }
        .gear {
          position: absolute;
          left: 50%;
          bottom: -78px;
          width: 666px;
          height: auto;
          transform: translateX(-50%);
          opacity: .78;
          filter: saturate(.82) contrast(.95) brightness(.72);
        }
        .chrome, .art {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .chrome {
          mix-blend-mode: normal;
          opacity: .95;
        }
        .art {
          filter: drop-shadow(0 0 18px rgba(100, 230, 255, .07));
        }
        .matte {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 48%, transparent 24%, rgba(3,3,6,.12) 54%, rgba(0,0,0,.46) 100%);
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <main class="stage">
        ${chromePanels()}
        <img class="gear" alt="" src="${gearSrc}"/>
        ${pageLayer(page)}
        <div class="matte"></div>
      </main>
    </body>
  </html>`;
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

for (const pageConfig of pages) {
  await page.setContent(html(pageConfig), { waitUntil: 'networkidle' });
  await page.locator('.stage').screenshot({
    path: path.join(outputDir, `${pageConfig.id}.png`),
    type: 'png',
  });
}

await browser.close();
