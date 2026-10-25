import { copyFile, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';

const here = new URL('./', import.meta.url);
const gallery = new URL('../../../../lab/image-galleries/classic-approved-states-20261025/', here);
const manifest = JSON.parse(await readFile(new URL('manifest.json', here), 'utf8'));
const files = new Set(manifest.assets.map(asset => asset.file));
await mkdir(new URL('assets/', gallery), { recursive: true });
for (const file of await readdir(new URL('assets/', gallery))) {
  if (/^terminal-(single|double)-(failed|partial-failed-(left|right))(\.svg|(?:@2x)?\.png)$/.test(file)) await unlink(new URL(`assets/${file}`, gallery));
}
for (const file of files) await copyFile(new URL(file, here), new URL(file, gallery));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const links = file => [
  [file, 'PNG'], [file.replace('.png', '@2x.png'), 'PNG 2배'], [file.replace('.png', '.svg'), 'SVG'],
].filter(([path]) => files.has(path)).map(([path, label]) => `<a href="${path}" download>${label}</a>`).join(' ');
const group = entry => `<section id="${entry.id}" aria-labelledby="${entry.id}-title"><h2 id="${entry.id}-title">${escape(entry.label)}</h2>${entry.note || entry.heldTreatment ? `<p>${escape(entry.note ?? entry.heldTreatment)}</p>` : ''}<div class="states">${entry.states.map(item => `<article data-state="${item.id}" data-file="${item.file}"><h3>${escape(item.label)}</h3><div class="tile${entry.id.startsWith('body-') ? ' body-tile' : ''}"${entry.id.startsWith('body-') ? ` style="background-image:url('${item.file}')"` : ''}>${entry.id.startsWith('body-') ? '' : `<img src="${item.file}" width="${entry.targetSize[0]}" height="${entry.targetSize[1]}" style="opacity:${item.alpha ?? 1}" alt="${escape(entry.label + ' ' + item.label)}" loading="lazy">`}</div><nav aria-label="${escape(entry.label + ' ' + item.label)} 다운로드">${links(item.file)}</nav></article>`).join('')}</div></section>`;
const groupsById = new Map(manifest.stateGroups.map(entry => [entry.id, entry]));
const ordered = ['body-double', 'body-single', 'point-double', 'sustain-double', 'sustain-single', 'release-double', 'release-single', 'sustain-layers', 'release-layers', 'unit-masks'];
const assembly = (kind, state = '') => {
  const body = state ? `body-${kind}-${state}` : kind === 'double' ? 'body-double-center-dual-beam' : 'body-single';
  const mark = `sustain-${kind}${state === 'partial-failed-left' ? '-partial-failed-left' : ''}`;
  return `<div class="assembly" style="--body:url('assets/${body}.png')"><div class="beam"></div><img class="mark" src="assets/${mark}.png" alt="바디 위 유지 표식" width="200" height="40"></div>`;
};
const bodyPreview = manifest.bodyCompositionPreview;
const bodyBoundaries = `<section id="body-boundaries"><h2>마감 없는 바디 시작과 끝</h2><p>아래가 시작, 위가 끝입니다. 바디만 있는 경우와 Point·릴리즈를 명시한 경우를 비교합니다.</p><div class="boundary-comparison">${bodyPreview.cases.map(item => `<article data-case="${item.id}"><h3>${escape(item.label)}</h3><div class="boundary-stage"><div class="boundary-body" style="background-image:url('${bodyPreview.bodyFile}')"></div>${item.point ? `<img class="boundary-point" src="${item.point}" width="212" height="40" alt="명시한 시작 Point">` : ''}${item.release ? `<img class="boundary-release" src="${item.release}" width="200" height="40" alt="명시한 끝 릴리즈">` : ''}</div></article>`).join('')}</div><p>별도 시작·끝 마감을 그리지 않습니다. 릴리즈 없는 끝에는 바디만 끝나며, 릴리즈가 있는 끝에는 J2-C 릴리즈 하나만 놓습니다.</p></section>`;
// THESIS: 확정한 전체 70%·Grace 외곽 유지와 별도 마감 없는 바디 경계를 보여 준다.
// OWN-WORLD: 기존 어두운 Lab, 포인트 212×40·바디/릴리즈 200×40, 에셋 중심 구성.
// STORY: 포인트 → 일반/Grace 릴리즈 성공 단계 → 명시한 노트만 있는 바디 경계.
// FIRST VIEWPORT: 기존 포인트 3열 다음에 일반·Grace 성공 단계를 같은 3열로 비교.
// FORM: 기존 화면의 좁은 확장. 두 배경을 각 열에 쌓고 모바일에서는 열을 순서대로 읽는다.
const releasePreview = manifest.releaseSuccessPreview;
const pointPreview = manifest.pointSuccessPreview;
const successSample = (preview, item, grace = false) => `<article data-state="${item.id}"><h4>${escape(item.label)}</h4>${preview.backgrounds.map(background => `<figure><figcaption>${escape(background.label)}</figcaption><div class="success-stage${grace ? ' with-grace' : ''}" data-background="${background.id}" style="--note-width:${preview.targetSize[0]}px;background-size:${(preview.bodySize ?? [200, 40]).map(size => `${size}px`).join(' ')};background-color:${background.color}${background.file ? `;background-image:url('${background.file}')` : ''}"><img class="success-note" src="${item.file}" width="${preview.targetSize[0]}" height="${preview.targetSize[1]}" style="opacity:${item.alpha}" alt="${escape(item.label)}" loading="lazy">${grace ? `<img class="success-outline" src="${preview.graceOverlay.file}" width="248" height="88" style="opacity:${item.overlayAlpha}" alt="전체 Grace 외곽" loading="lazy">` : ''}</div></figure>`).join('')}</article>`;
const releaseSample = item => successSample(releasePreview, item);
const pointSuccess = `<section id="point-success" aria-labelledby="point-success-title">
<h2 id="point-success-title">더블 포인트 · 일부 성공 비교</h2>
<p>선택한 M6 포인트를 바디 위에 올렸습니다. 일부 성공하면 포인트 전체가 70%로 흐려지고, 모두 성공하면 바디만 남습니다.</p>
<div class="success-comparison" data-comparison="progression">${pointPreview.progression.map(item => successSample(pointPreview, item)).join('')}</div>
<p>포인트 212×40과 바디 200×40의 중심을 맞췄습니다. 바디 밝기는 그대로이며, 포인트는 기존 일반 더블과 같은 표시 불투명도를 사용합니다.</p>
</section>`;
const releaseSuccess = `<section id="release-success" aria-labelledby="release-success-title">
<h2 id="release-success-title">더블 릴리즈 · 일부 성공 비교</h2>
<p>최종 C안(J2-C)의 일부 성공은 정상 도안 전체 70%로 표시합니다. 모양·색·위치를 유지하고 불투명도만 낮춥니다.</p>
<h3>일반 릴리즈</h3><div class="success-comparison" data-comparison="progression">${releasePreview.progression.map(releaseSample).join('')}</div>
<h3 id="grace-success">Grace 릴리즈 · 본체만 흐리게</h3>
<div class="success-comparison" data-comparison="grace-progression">${releasePreview.graceProgression.map(item => successSample(releasePreview, item, true)).join('')}</div>
<p>Grace 일부 성공은 본체 70%·전체 외곽 100%입니다. 모두 성공하면 본체와 외곽을 함께 숨깁니다. 반쪽 숨김 시안은 전체 70% 표시로 대체했습니다.</p>
<p>실패가 확정된 릴리즈는 실패색으로 바꾸고 스크롤되어 화면 밖으로 나갈 때까지 남깁니다. 바디 실패로 기회를 잃은 릴리즈도 포함하며, 판정 가능·유예 대기 중에는 먼저 실패색으로 바꾸지 않습니다. 성공·실패가 섞인 더블의 최종 합성과 유지 노트 표시는 별도 검토입니다.</p>
</section>`;
const sustainPreview = manifest.sustainVisibilityPreview;
const sustainVisibility = `<section id="sustain-visibility" aria-labelledby="sustain-visibility-title"><h2 id="sustain-visibility-title">유지 표식 · 광선 홈 폭 + 윤곽선</h2><p>싱글은 홈 폭 36px와 바로 바깥 파란선까지 넓힌 44px를 비교합니다. 같은 비율로 키우고 어두운 윤곽선을 둘렀습니다. 높이는 일반 노트와 같은 40px 안에 들어갑니다.</p>${sustainPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글 · 파란선까지 확대 비교' : '더블 · 각 32px'}</h3><div class="sustain-comparison" data-kind="${entry.kind}">${[['original', '기존'], ['candidate', `홈 폭 · ${entry.kind === 'double' ? '각 ' : ''}${entry.markerWidth}px`], ...(entry.railCandidate ? [['railCandidate', `파란선까지 · ${entry.railMarkerWidth}px`]] : [])].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4>${[['held', '바디 활성화', entry.heldBody], ['idle', '바디 대기', entry.idleBody]].map(([state, title, body]) => `<figure><figcaption>${title}</figcaption><div class="sustain-stage" data-body-state="${state}" style="background-image:url('${body}')"><img src="${entry[key]}" width="200" height="40" alt="${entry.kind === 'single' ? '싱글' : '더블'} 유지 ${label}"></div></figure>`).join('')}<figure><figcaption>게임 배율 · 활성 바디</figcaption><div class="sustain-game"><div class="sustain-stage" data-body-state="game-held" style="background-image:url('${entry.heldBody}')"><img src="${entry[key]}" width="200" height="40" alt="게임 배율 유지 ${label}"></div></div></figure><nav aria-label="${entry.kind} ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}<p>윤곽선은 표식 자체의 경계를 구분하는 선입니다. Grace 외곽이나 별도 발광 효과가 아닙니다. 싱글·더블 원본과 기존 실패 표시는 유지하며, 이 확대안은 비교용입니다.</p></section>`;
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Classic 상태별 에셋 검토</title><link rel="stylesheet" href="style.css"></head>
<body><main><header><a href="../../">← Lab 목록</a><p class="edition">Classic · 판정 연결 준비</p><h1>상태별 에셋 검토</h1><p>확정 도안으로 만든 유지·실패·몫별 표시 시안입니다. 확정한 성공·실패 표시와 검토 중인 색의 강도를 구분해 확인합니다.</p><p>릴리즈도 최종 C안(J2-C)을 사용합니다. D 매듭은 유지 표식입니다. 바디와 유지 표식에는 Grace를 붙이지 않습니다.</p><nav class="jump"><a href="#sustain-visibility">유지 가독성</a><a href="#point-success">포인트 일부 성공</a><a href="#release-success">릴리즈 일부 성공</a><a href="#body-double">바디</a><a href="#body-boundaries">바디 시작·끝</a><a href="#point-double">누름</a><a href="#sustain-double">유지</a><a href="#release-double">릴리즈</a><a href="#sustain-layers">남은 몫</a></nav></header>
${sustainVisibility}
${pointSuccess}
${releaseSuccess}
${bodyBoundaries}
<section id="assemblies"><h2>바디 연결과 길이 0</h2><div class="states"><article><h3>싱글 · 유지 표식</h3>${assembly('single')}</article><article><h3>더블 · 전체 유지</h3>${assembly('double', 'held')}</article><article><h3>더블 · 왼쪽 실패</h3>${assembly('double', 'partial-failed-left')}</article><article><h3>길이 0 · 바디 + 유지</h3><div class="zero" style="background-image:url('assets/body-single.png')"><img src="assets/sustain-single.png" width="200" height="40" alt="길이 0 싱글 바디 위 유지 표식"></div><div class="zero" style="background-image:url('assets/body-double-center-dual-beam.png')"><img src="assets/sustain-double.png" width="200" height="40" alt="길이 0 더블 바디 위 유지 표식"></div><p>마감 두 개나 누름 노트를 덧붙이지 않습니다.</p></article></div><p>바디에는 별도 시작·끝 마감이 없습니다. 유지 표식은 바디 위에만 놓습니다.</p></section>
${ordered.map(id => group(groupsById.get(id))).join('\n')}
<section id="grace"><h2>일부 실패에도 전체 Grace 윤곽</h2><p>왼쪽 실패색 본체와 별도 overlay를 한 번씩 합성한 자료입니다. 성공·실패 혼합의 최종 합성을 확정하는 시연은 아닙니다.</p><div class="states"><article><h3>왼쪽 실패 · 전체 외곽</h3><div class="grace"><img class="grace-base" src="assets/release-double-partial-failed-left.png" width="200" height="40" alt="더블 릴리즈 본체"><img class="grace-outline" src="assets/release-grace-overlay.png" width="248" height="88" alt="전체 외곽 Grace"></div></article></div></section>
<section id="downloads"><h2>파일 다운로드 · ${manifest.assets.length}개</h2><p>기본 크기, 2배 PNG, SVG를 제공합니다. J2-C 릴리즈·실패 SVG는 PNG를 내장한 래퍼입니다.</p><details><summary>모든 파일 펼치기</summary><ul>${manifest.assets.map(asset => `<li><a href="${asset.file}" download>${escape(asset.file.slice(7))}</a> <span>${asset.width}×${asset.height}${asset.usage === 'release-source' ? ' · 릴리즈 원본' : asset.usage === 'historical-reference' ? ' · 과거 참고본, 새 모델 미사용' : ''}</span></li>`).join('')}</ul></details></section>
<footer>자료 검토용 미리보기입니다. 실제 스킨·차트·판정 엔진은 변경하지 않았습니다.</footer></main></body></html>\n`;
await writeFile(new URL('index.html', gallery), html);
await writeFile(new URL('style.css', gallery), `:root{color-scheme:dark;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#edf2f7;background:#0b0e13}*{box-sizing:border-box}body{margin:0}main{max-width:1140px;margin:auto;padding:32px 28px}a{color:#b9d9f3;text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:2px solid #b9d9f3;outline-offset:4px}h1{font-size:clamp(28px,4vw,42px);margin:8px 0 16px}h2{font-size:22px;margin:0 0 18px}h3{font-size:14px;line-height:1.5;margin:0 0 14px;min-height:42px}p{color:#b5c4d5;line-height:1.65;font-size:14px}.edition{margin:28px 0 8px;color:#f2d68b}section{margin-top:44px;scroll-margin-top:24px}.jump{display:flex;gap:14px;flex-wrap:wrap}.states{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px 20px}article{min-width:0;padding:18px 12px;border-top:1px solid #303945}article nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;font-size:12px}.tile{height:80px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#171e28 0% 25%,#10151d 0% 50%) 0 0/16px 16px}.tile img{max-width:100%;height:auto}.body-tile{width:200px;margin:auto;background-size:200px 40px}.assembly{position:relative;width:200px;height:200px;margin:auto;background:#080c12}.beam{position:absolute;top:0;bottom:0;width:200px;background-image:var(--body);background-size:200px 40px}.assembly img{position:absolute;left:0;width:200px;height:40px}.mark{top:80px}.zero{width:200px;height:40px;background-size:200px 40px;margin:0 auto 20px}.zero img{display:block}.grace{position:relative;width:248px;height:88px;margin:auto}.grace img{position:absolute}.grace-base{left:24px;top:24px}.grace-outline{left:0;top:0}#grace .states{grid-template-columns:repeat(auto-fit,minmax(274px,1fr))}summary{cursor:pointer;color:#c5dff4;padding:10px 0}ul{padding-left:20px}li{margin:8px 0;overflow-wrap:anywhere}li span{color:#b5c4d5;font-size:12px}footer{border-top:1px solid #303945;padding-top:24px;margin-top:40px;color:#b5c4d5;font-size:13px}
.success-comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
#release-success>h3{font-size:17px;min-height:0;margin:30px 0 14px}
.success-comparison h4{font-size:14px;line-height:1.5;margin:0 0 18px}
.success-comparison figure{margin:0 0 16px}
.success-comparison figcaption{font-size:12px;color:#b5c4d5;margin-bottom:8px;text-align:center}
.success-stage{position:relative;width:var(--note-width);height:104px;margin:auto;background-position:center top;background-repeat:repeat-y}
.success-stage .success-note{position:absolute;left:0;top:32px;width:var(--note-width);height:40px}
.success-stage.with-grace{width:248px;--note-width:200px}
.success-stage.with-grace .success-note{left:24px}
.success-stage .success-outline{position:absolute;left:0;top:8px;width:248px;height:88px}
.boundary-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.boundary-stage{position:relative;width:212px;height:200px;margin:auto;background:#080c12}
.boundary-body{position:absolute;left:6px;top:20px;width:200px;height:160px;background-size:200px 40px}
.boundary-stage img{position:absolute;height:40px}
.boundary-point{left:0;top:160px;width:212px}
.boundary-release{left:6px;top:0;width:200px}
.sustain-comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}
#sustain-visibility>h3{font-size:17px;min-height:0;margin:32px 0 14px}
.sustain-comparison h4{font-size:15px;margin:0 0 22px}
.sustain-comparison figure{margin:0 0 22px}
.sustain-comparison figcaption{font-size:12px;color:#b5c4d5;text-align:center;margin-bottom:8px}
.sustain-stage{position:relative;width:200px;height:112px;margin:auto;background-size:200px 40px}
.sustain-stage img{position:absolute;top:36px;left:0;width:200px;height:40px}
.sustain-game{width:59px;height:34px;margin:auto}
.sustain-game .sustain-stage{transform:scale(0.29481132);transform-origin:top left}
@media(max-width:600px){.sustain-comparison{grid-template-columns:1fr}}
@media(max-width:880px){.success-comparison{grid-template-columns:1fr}.success-comparison article{max-width:440px;width:100%;margin:auto}}
@media(max-width:600px){.boundary-comparison{grid-template-columns:1fr}}
@media(max-width:760px){.success-comparison{grid-template-columns:1fr}.success-comparison article{max-width:440px;width:100%;margin:auto}}
@media(max-width:600px){main{padding:24px 16px}.states{grid-template-columns:1fr}article{padding-inline:8px}h3{min-height:0}}\n`);
console.log('Lab gallery: /lab/images/classic-approved-states-20261025/');
