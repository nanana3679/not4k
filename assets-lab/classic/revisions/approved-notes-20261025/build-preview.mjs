import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const here = new URL('./', import.meta.url);
const gallery = new URL('../../../../lab/image-galleries/classic-approved-states-20261025/', here);
const manifest = JSON.parse(await readFile(new URL('manifest.json', here), 'utf8'));
const files = new Set(manifest.assets.map(asset => asset.file));
await mkdir(new URL('assets/', gallery), { recursive: true });
for (const file of files) await copyFile(new URL(file, here), new URL(file, gallery));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const links = file => [
  [file, 'PNG'], [file.replace('.png', '@2x.png'), 'PNG 2배'], [file.replace('.png', '.svg'), 'SVG'],
].filter(([path]) => files.has(path)).map(([path, label]) => `<a href="${path}" download>${label}</a>`).join(' ');
const group = entry => `<section id="${entry.id}" aria-labelledby="${entry.id}-title"><h2 id="${entry.id}-title">${escape(entry.label)}</h2>${entry.note || entry.heldTreatment ? `<p>${escape(entry.note ?? entry.heldTreatment)}</p>` : ''}<div class="states">${entry.states.map(item => `<article data-state="${item.id}" data-file="${item.file}"><h3>${escape(item.label)}</h3><div class="tile${entry.id.startsWith('body-') ? ' body-tile' : ''}"${entry.id.startsWith('body-') ? ` style="background-image:url('${item.file}')"` : ''}>${entry.id.startsWith('body-') ? '' : `<img src="${item.file}" width="${entry.targetSize[0]}" height="${entry.targetSize[1]}" style="opacity:${item.alpha ?? 1}" alt="${escape(entry.label + ' ' + item.label)}" loading="lazy">`}</div><nav aria-label="${escape(entry.label + ' ' + item.label)} 다운로드">${links(item.file)}</nav></article>`).join('')}</div></section>`;
const groupsById = new Map(manifest.stateGroups.map(entry => [entry.id, entry]));
const ordered = ['body-double', 'body-single', 'terminal-double', 'terminal-single', 'point-double', 'sustain-double', 'sustain-single', 'release-double', 'release-single', 'sustain-layers', 'release-layers', 'unit-masks'];
const assembly = (kind, state = '') => {
  const body = state ? `body-${kind}-${state}` : kind === 'double' ? 'body-double-center-dual-beam' : 'body-single';
  const terminal = state === 'partial-failed-left' ? `terminal-${kind}-partial-failed-left` : `terminal-j2-shadow-3-${kind}`;
  const mark = `sustain-${kind}${state === 'partial-failed-left' ? '-partial-failed-left' : ''}`;
  return `<div class="assembly" style="--body:url('assets/${body}.png')"><div class="beam"></div><img class="end" src="assets/${terminal}.png" alt="끝 마감" width="200" height="40"><img class="mark" src="assets/${mark}.png" alt="바디 위 유지 표식" width="200" height="40"><img class="start" src="assets/${terminal}.png" alt="상하반전한 시작 마감" width="200" height="40"></div>`;
};
// THESIS: 일부 성공의 전체 70% 시안을 반쪽 숨김·일부 실패와 직접 비교한다.
// OWN-WORLD: 기존 어두운 Lab, 원본 200×40 크기, 설명보다 에셋이 먼저 보이는 구성.
// STORY: 성공 단계 확인 → 같은 자리의 세 표시 방식 비교 → 단색/바디 가독성 판단.
// FIRST VIEWPORT: 헤더 다음에 3열 성공 단계, 그 아래에 같은 3열 대안 비교.
// FORM: 기존 화면의 좁은 확장. 두 배경을 각 열에 쌓고 모바일에서는 열을 순서대로 읽는다.
const releasePreview = manifest.releaseSuccessPreview;
const releaseSample = item => `<article data-state="${item.id}"><h4>${escape(item.label)}</h4>${releasePreview.backgrounds.map(background => `<figure><figcaption>${escape(background.label)}</figcaption><div class="release-stage" data-background="${background.id}" style="background-color:${background.color}${background.file ? `;background-image:url('${background.file}')` : ''}"><img src="${item.file}" width="${releasePreview.targetSize[0]}" height="${releasePreview.targetSize[1]}" style="opacity:${item.alpha}" alt="${escape(item.label)}" loading="lazy"></div></figure>`).join('')}</article>`;
const releaseSuccess = `<section id="release-success" aria-labelledby="release-success-title">
<h2 id="release-success-title">더블 릴리즈 · 일부 성공 비교</h2>
<p>마지막에 선택한 C안(J2-C)으로 일부 성공 때 전체를 70%로 흐리게 하는 시안입니다. 모양·색·위치를 유지하고 불투명도만 낮춥니다. 70%는 아직 확정하지 않았습니다.</p>
<h3>성공 단계 · 전체 알파 시안</h3><div class="release-comparison" data-comparison="progression">${releasePreview.progression.map(releaseSample).join('')}</div>
<h3>전체 70% · 반쪽 숨김 · 일부 실패</h3><p>왼쪽 몫을 기준으로 비교합니다. 앞의 두 칸은 일부 성공, 마지막 칸은 일부 실패입니다.</p>
<div class="release-comparison" data-comparison="alternatives">${[releasePreview.progression.find(item => item.id === 'partial-success'), ...releasePreview.alternatives].map(releaseSample).join('')}</div>
<p>일반 릴리즈만 비교합니다. Grace 외곽의 표시와 실패 그림을 남기는 시간은 별도 검토 항목입니다.</p>
</section>`;
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Classic 상태별 에셋 검토</title><link rel="stylesheet" href="style.css"></head>
<body><main><header><a href="../../">← Lab 목록</a><p class="edition">Classic · 판정 연결 준비</p><h1>상태별 에셋 검토</h1><p>확정 도안으로 만든 유지·실패·몫별 표시 시안입니다. 색의 강도와 실패 그림을 남기는 방식은 검토 중입니다.</p><p>릴리즈도 최종 C안(J2-C)을 사용합니다. D 매듭은 유지 표식입니다. 바디와 유지 표식에는 Grace를 붙이지 않습니다.</p><nav class="jump"><a href="#release-success">릴리즈 일부 성공</a><a href="#body-double">바디</a><a href="#terminal-double">마감</a><a href="#point-double">누름</a><a href="#sustain-double">유지</a><a href="#release-double">릴리즈</a><a href="#sustain-layers">남은 몫</a></nav></header>
${releaseSuccess}
<section id="assemblies"><h2>바디 연결과 길이 0</h2><div class="states"><article><h3>싱글 · 유지 표식</h3>${assembly('single')}</article><article><h3>더블 · 전체 유지</h3>${assembly('double', 'held')}</article><article><h3>더블 · 왼쪽 실패</h3>${assembly('double', 'partial-failed-left')}</article><article><h3>길이 0 · 바디 + 유지</h3><div class="zero" style="background-image:url('assets/body-single.png')"><img src="assets/sustain-single.png" width="200" height="40" alt="길이 0 싱글 바디 위 유지 표식"></div><div class="zero" style="background-image:url('assets/body-double-center-dual-beam.png')"><img src="assets/sustain-double.png" width="200" height="40" alt="길이 0 더블 바디 위 유지 표식"></div><p>마감 두 개나 누름 노트를 덧붙이지 않습니다.</p></article></div><p>긴 바디 아래에는 시작 마감을 상하반전해 놓았습니다. 연결 방식과 표시 수명은 새 모델에서 확인할 항목입니다.</p></section>
${ordered.map(id => group(groupsById.get(id))).join('\n')}
<section id="grace"><h2>일부 실패에도 전체 Grace 윤곽</h2><p>아래는 본체와 별도 overlay를 한 번씩 합성한 모습입니다. 한쪽 성공 후 남은 몫도 같은 좌표에서 볼 수 있습니다.</p><div class="states">${['release-double-partial-failed-left', 'release-double-unit-right'].map((name, i) => `<article><h3>${i === 0 ? '왼쪽 실패 · 전체 외곽' : '왼쪽 성공 · 오른쪽만 남김 (표시안)'}</h3><div class="grace"><img class="grace-base" src="assets/${name}.png" width="200" height="40" alt="더블 릴리즈 본체"><img class="grace-outline" src="assets/release-grace-overlay.png" width="248" height="88" alt="전체 외곽 Grace"></div></article>`).join('')}</div></section>
<section id="downloads"><h2>파일 다운로드 · ${manifest.assets.length}개</h2><p>기본 크기, 2배 PNG, SVG를 제공합니다. J2-C 릴리즈·실패 SVG는 PNG를 내장한 래퍼입니다.</p><details><summary>모든 파일 펼치기</summary><ul>${manifest.assets.map(asset => `<li><a href="${asset.file}" download>${escape(asset.file.slice(7))}</a> <span>${asset.width}×${asset.height}</span></li>`).join('')}</ul></details></section>
<footer>자료 검토용 미리보기입니다. 실제 스킨·차트·판정 엔진은 변경하지 않았습니다.</footer></main></body></html>\n`;
await writeFile(new URL('index.html', gallery), html);
await writeFile(new URL('style.css', gallery), `:root{color-scheme:dark;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:#edf2f7;background:#0b0e13}*{box-sizing:border-box}body{margin:0}main{max-width:1140px;margin:auto;padding:32px 28px}a{color:#b9d9f3;text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:2px solid #b9d9f3;outline-offset:4px}h1{font-size:clamp(28px,4vw,42px);margin:8px 0 16px}h2{font-size:22px;margin:0 0 18px}h3{font-size:14px;line-height:1.5;margin:0 0 14px;min-height:42px}p{color:#b5c4d5;line-height:1.65;font-size:14px}.edition{margin:28px 0 8px;color:#f2d68b}section{margin-top:44px;scroll-margin-top:24px}.jump{display:flex;gap:14px;flex-wrap:wrap}.states{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px 20px}article{min-width:0;padding:18px 12px;border-top:1px solid #303945}article nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px;font-size:12px}.tile{height:80px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#171e28 0% 25%,#10151d 0% 50%) 0 0/16px 16px}.tile img{max-width:100%;height:auto}.body-tile{width:200px;margin:auto;background-size:200px 40px}.assembly{position:relative;width:200px;height:200px;margin:auto;background:#080c12}.beam{position:absolute;top:40px;bottom:40px;width:200px;background-image:var(--body);background-size:200px 40px}.assembly img{position:absolute;left:0;width:200px;height:40px}.end{top:0}.start{bottom:0;transform:scaleY(-1)}.mark{top:80px}.zero{width:200px;height:40px;background-size:200px 40px;margin:0 auto 20px}.zero img{display:block}.grace{position:relative;width:248px;height:88px;margin:auto}.grace img{position:absolute}.grace-base{left:24px;top:24px}.grace-outline{left:0;top:0}#grace .states{grid-template-columns:repeat(auto-fit,minmax(274px,1fr))}summary{cursor:pointer;color:#c5dff4;padding:10px 0}ul{padding-left:20px}li{margin:8px 0;overflow-wrap:anywhere}li span{color:#b5c4d5;font-size:12px}footer{border-top:1px solid #303945;padding-top:24px;margin-top:40px;color:#b5c4d5;font-size:13px}
.release-comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
#release-success>h3{font-size:17px;min-height:0;margin:30px 0 14px}
.release-comparison h4{font-size:14px;line-height:1.5;margin:0 0 18px}
.release-comparison figure{margin:0 0 16px}
.release-comparison figcaption{font-size:12px;color:#b5c4d5;margin-bottom:8px;text-align:center}
.release-stage{position:relative;width:200px;height:104px;margin:auto;background-size:200px 40px;background-repeat:repeat-y}
.release-stage img{position:absolute;left:0;top:32px;width:200px;height:40px}
@media(max-width:760px){.release-comparison{grid-template-columns:1fr}.release-comparison article{max-width:440px;width:100%;margin:auto}}
@media(max-width:600px){main{padding:24px 16px}.states{grid-template-columns:1fr}article{padding-inline:8px}h3{min-height:0}}\n`);
console.log('Lab gallery: /lab/images/classic-approved-states-20261025/');
