import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const gallery = resolve(source, '../../../../lab/image-galleries/long-note-body-six-20260929');
const report = JSON.parse(await readFile(resolve(source, 'point-spectrum.json'), 'utf8'));
const kinds = [['single', '싱글 · 파랑', 'S'], ['double', '더블 · 금색', 'D']];
const selection = JSON.parse(await readFile(resolve(source, 'selected/selection.json'), 'utf8'));
const selectedCards = kinds.map(([kind, label]) => {
  const body = `spectrum-${kind}-${String(selection.body.step).padStart(2, '0')}`;
  const point = `point-${kind}-${selection.point.variant}`;
  return `<article class="selected-card ${kind}">
    <header><p>선택 확정</p><h3>${label}</h3></header>
    <figure><div class="selected-assembly"><div class="recommendation-repeat" style="background-image:url('${body}.png')" role="img" aria-label="${label} 아주 밝은 바디 4회 반복"></div><img src="${point}.png" width="212" height="40" alt="${label} 기존 고채도 포인트"></div><figcaption>바디 01 · ${selection.body.label} + ${selection.point.label} 포인트</figcaption></figure>
    <footer><a href="${body}.png" download="body-${kind}.png">바디·터미널 1000×200</a><a href="${body}-200x40.png" download="body-${kind}-200x40.png">바디·터미널 200×40</a><a href="${point}.png" download="point-${kind}.png">포인트 212×40</a></footer>
  </article>`;
}).join('');
const recommendationText = [
  ['추천 1 · 가장 또렷한 밝은 포인트', '아주 밝은 포인트와 가장 짙은 바디를 연결합니다.'],
  ['추천 2 · 포인트에 색을 조금 더', '포인트를 한 단계 진하게 해 파랑·금색을 더 남깁니다.'],
];

function assembly(body, point, large = false) {
  return `<div class="${large ? 'recommendation-assembly' : 'mini-assembly'}"><div class="${large ? 'recommendation-repeat' : 'mini-repeat'}" style="background-image:url('${body}.png')" role="img" aria-label="바디 반복 미리보기"></div><img src="${point}-212x40.png" width="212" height="40" alt="연결된 포인트" loading="lazy"></div>`;
}

const recommendations = report.recommended.slice(0, 2).map((choice, i) => `
      <article class="recommendation-card">
        <header><p>${recommendationText[i][0]}</p><h3>포인트 ${choice.pointStep} + 바디 ${choice.bodyStep}</h3><span>${recommendationText[i][1]}</span></header>
        <div class="recommendation-pair">${choice.pair.map(c => {
          const [, label] = kinds.find(k => k[0] === c.kind);
          return `<figure class="${c.kind}"><figcaption>${label}<strong>${c.ratio.toFixed(2)}:1</strong></figcaption>${assembly(c.body, c.point, true)}<div class="recommendation-downloads"><a href="${c.point}-212x40.png" download>포인트 PNG</a><a href="${c.body}-200x40.png" download>바디 PNG</a></div></figure>`;
        }).join('')}</div>
      </article>`).join('');

const pointRows = kinds.map(([kind, label, prefix]) => `
      <section class="point-spectrum-series ${kind}"><h3>${label}</h3><div class="point-spectrum-grid">${report.points.filter(p => p.kind === kind).map(p => `
        <article class="point-spectrum-card" data-kind="${kind}" id="${p.id}"><header><span>${prefix}·P${String(p.step).padStart(2, '0')}</span><h4>${p.title}</h4></header><div class="point-spectrum-image"><img src="${p.id}-212x40.png" width="212" height="40" alt="${label} 포인트 ${p.step}단계 · ${p.title}" loading="lazy"></div><footer><a href="${p.id}.png" download>1060×200</a><a href="${p.id}-212x40.png" download>212×40</a><a href="${p.id}.svg" download>SVG</a></footer></article>`).join('')}
      </div></section>`).join('');

const matrices = kinds.map(([kind, label]) => `
      <section class="combination-matrix ${kind}"><h3>${label} · 36개 조합</h3><div class="matrix-scroll" tabindex="0" role="region" aria-label="${label} 바디와 포인트 조합 표"><table><thead><tr><th scope="col">바디 ↓ / 포인트 →</th>${[1, 2, 3, 4, 5, 6].map(step => `<th scope="col">포인트 ${step}</th>`).join('')}</tr></thead><tbody>${[1, 2, 3, 4, 5, 6].map(bodyStep => `<tr><th scope="row">바디 ${bodyStep}</th>${[1, 2, 3, 4, 5, 6].map(pointStep => {
        const c = report.combinations.find(v => v.kind === kind && v.bodyStep === bodyStep && v.pointStep === pointStep);
        const recommended = report.recommended.slice(0, 2).some(r => r.bodyStep === bodyStep && r.pointStep === pointStep);
        return `<td${recommended ? ' class="recommended-cell"' : ''}>${assembly(c.body, c.point)}<span>${c.ratio.toFixed(2)}:1${recommended ? ' · 추천' : ''}</span></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');

const content = `<!-- POINT COMPARISON START -->
    <section id="selected-combination"><div class="study-heading"><h2>선택한 조합</h2><p>바디는 가장 밝은 1단계, 포인트는 기존 고채도 원본입니다.<br>100:20 바디 타일을 상하로 반복하고 시작·끝 터미널에도 함께 씁니다.</p></div><div class="selected-grid">${selectedCards}</div><p class="selected-bundle"><a href="selected-note-assets.zip" download>선택 에셋 전체 다운로드 · PNG + SVG</a></p></section>
    <nav class="point-study-nav" aria-label="선택 전 비교 영역"><a href="#intrinsic-spectrum">바디 6단계</a><a href="#point-spectrum">포인트 6단계</a><a href="#all-point-body-combinations">전체 72개 조합</a><a href="#contrast-recommendations">이전 추천</a></nav>
    <details class="history" id="contrast-recommendations"><summary>선택 전 추천 비교 · 밝은 포인트 + 짙은 바디</summary><div class="recommendation-grid">${recommendations}</div><p class="contrast-method">선택 전 비교 기록입니다. 수치는 중앙 색면의 평균 명도 대비이며 실제 플레이 중 식별성 점수는 아닙니다.</p></details>
    <section id="point-spectrum"><div class="study-heading"><h2>포인트도 같은 밝기 6단계</h2><p>승인된 바디의 실제 색을 기준으로 중앙 면만 바꿨습니다. 형상·테두리·발광 레일은 동일합니다.</p></div>${pointRows}</section>
    <details class="history all-combinations" id="all-point-body-combinations"><summary>전체 72개 조합 비교 · 바디 6단계 × 포인트 6단계 × 싱글·더블</summary><p class="contrast-method">행은 바디, 열은 포인트 단계입니다. 밝은 포인트를 쓰는 추천 조합에 테두리를 표시했습니다.</p>${matrices}</details>
<!-- POINT COMPARISON END -->`;

const css = `<style id="point-comparison-style">
    #selected-combination{margin-bottom:36px}.selected-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.selected-card{background:#101a2b;border:1px solid #416583;border-radius:12px;overflow:hidden;min-width:0}.selected-card.double{border-color:#766644}.selected-card header{padding:20px 24px}.selected-card header p{margin:0 0 6px;color:#9bd6ff;font-size:12px}.selected-card.double header p{color:#efda97}.selected-card h3{margin:0;font-size:21px}.selected-card figure{display:grid;justify-items:center;gap:18px;margin:0;background:#080f1c;padding:24px}.selected-assembly{width:212px;max-width:100%}.selected-assembly img{display:block;width:100%;height:auto}.selected-card figcaption{font-size:13px;color:#bbcde2;text-align:center;line-height:1.6}.selected-card footer{display:flex;justify-content:center;flex-wrap:wrap;gap:12px 20px;padding:18px}.selected-card footer a{font-size:12px}.selected-card.double a{color:#ead59e}.selected-bundle{margin:20px 0 0}.selected-bundle a{display:inline-block;font-size:14px;border:1px solid #416583;border-radius:7px;padding:12px 18px;text-decoration:none}@media(max-width:620px){.selected-grid{grid-template-columns:1fr}.selected-card header{padding:18px}}
    .point-study-nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin:0 0 26px}.point-study-nav a{font-size:13px}#contrast-recommendations,#point-spectrum{margin-bottom:32px}.recommendation-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.recommendation-card{border:1px solid #416583;border-radius:12px;background:#101a2b;overflow:hidden}.recommendation-card header{padding:20px}.recommendation-card header p{font-size:12px;color:#94caec;margin:0 0 8px}.recommendation-card h3{font-size:22px;margin:0 0 8px}.recommendation-card header span{font-size:13px;line-height:1.6;color:#a7b8ce}.recommendation-pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;background:#080f1c;padding:20px}.recommendation-pair figure{margin:0;min-width:0;display:grid;justify-items:center;gap:14px}.recommendation-pair figcaption{text-align:center;font-size:12px}.recommendation-pair figcaption strong{display:block;color:#eaf3ff;font-size:18px;margin-top:7px}.recommendation-assembly{width:159px;max-width:100%}.recommendation-repeat{width:94.339623%;margin:0 auto;aspect-ratio:5/4;background-repeat:repeat-y;background-size:100% auto}.recommendation-assembly img{display:block;width:100%;height:auto}.recommendation-downloads{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.recommendation-downloads a{font-size:11px}.recommendation-pair .double a{color:#ead59e}.contrast-method{font-size:12px;color:#8195b1;line-height:1.65;margin:16px 0 0}.point-spectrum-series{margin:0 0 24px}.point-spectrum-series h3{font-size:17px;margin:0 0 12px}.point-spectrum-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.point-spectrum-card{border:1px solid #30445d;border-radius:10px;overflow:hidden;background:#101a2b;min-width:0}.point-spectrum-card header{padding:12px;display:flex;gap:8px;align-items:center}.point-spectrum-card header span{font-size:11px;font-weight:650;white-space:nowrap}.point-spectrum-card h4{font-size:12px;font-weight:500;color:#eaf3ff;margin:0}.point-spectrum-image{padding:0 12px 14px}.point-spectrum-image img{display:block;width:100%;height:auto}.point-spectrum-card footer{display:flex;flex-wrap:wrap;gap:4px 10px;padding:10px 12px;border-top:1px solid #26364a}.point-spectrum-card footer a{font-size:10px}.point-spectrum-series.double a{color:#ead59e}.all-combinations{margin-bottom:30px}.all-combinations>.contrast-method{margin:0 0 20px}.combination-matrix{margin-bottom:28px}.combination-matrix h3{font-size:17px;margin:0 0 14px}.matrix-scroll{overflow:auto}.matrix-scroll:focus-visible{outline:2px solid #a6d8fa;outline-offset:3px}.matrix-scroll table{width:100%;min-width:820px;border-collapse:collapse;background:#0b1423}.matrix-scroll th{font-size:12px;font-weight:500;padding:12px;color:#bacce0;line-height:1.6}.matrix-scroll th:first-child{width:100px}.matrix-scroll td{padding:12px 8px;text-align:center;border:1px solid #26364a}.matrix-scroll .mini-assembly{margin:0 auto}.matrix-scroll .mini-repeat{height:40px}.matrix-scroll td>span{display:block;font-size:11px;color:#a7b8ce;margin-top:9px}.matrix-scroll td.recommended-cell{box-shadow:inset 0 0 0 2px #99cff6}.matrix-scroll td.recommended-cell>span{color:#d7eeff}@media(max-width:1100px){.point-spectrum-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:750px){.recommendation-grid{grid-template-columns:1fr}}@media(max-width:560px){.point-spectrum-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.recommendation-pair{gap:16px;padding:16px}.point-spectrum-card header{gap:6px}}
  </style>`;

const path = resolve(gallery, 'index.html');
let html = await readFile(path, 'utf8');
html = html.replace(/<title>[^<]*<\/title>/, '<title>선택안 · 아주 밝은 바디 + 고채도 포인트</title>');
html = html.replace(/<h1>[^<]*<\/h1><p>[\s\S]*?<\/p>/, '<h1>아주 밝은 바디 + 고채도 포인트</h1><p>싱글은 파랑, 더블은 금색.<br>선택한 조합과 바로 사용할 에셋을 모았습니다.</p>');
if (html.includes('<!-- POINT COMPARISON START -->')) {
  html = html.replace(/<!-- POINT COMPARISON START -->[\s\S]*?<!-- POINT COMPARISON END -->/, content);
} else {
  html = html.replace('    <section id="intrinsic-spectrum"', content + '\n    <section id="intrinsic-spectrum"');
}
html = html.replace(/<style id="point-comparison-style">[\s\S]*?<\/style>/, '');
html = html.replace('</head>', css + '\n</head>');
await writeFile(path, html);
console.log('Selected bright body + saturated point, spectrum and comparison history rendered.');
