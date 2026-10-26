import { copyFile, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { releasePartsHtml, releasePartsCss } from './release-parts.mjs';
import { releaseJunctionHtml, releaseJunctionCss } from './release-junction.mjs';

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
const sustainVisibility = `<section id="sustain-visibility" aria-labelledby="sustain-visibility-title"><h2 id="sustain-visibility-title">유지 표식 · 광선 홈 폭 + 윤곽선</h2><p>싱글은 홈 폭 36px와 바로 바깥 파란선까지 넓힌 44px를 비교합니다. 같은 비율로 키우고 어두운 윤곽선을 둘렀습니다. 높이는 일반 노트와 같은 40px 안에 들어갑니다.</p>${sustainPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글 · 파란선까지 확대 비교' : '더블 · 각 32px'}</h3><div class="sustain-comparison" data-kind="${entry.kind}">${[['original', '기존'], ['candidate', `홈 폭 · ${entry.kind === 'double' ? '각 ' : ''}${entry.markerWidth}px`], ...(entry.railCandidate ? [['railCandidate', `파란선까지 · ${entry.railMarkerWidth}px${sustainPreview.selected[entry.kind] === entry.railCandidate ? ' (선택)' : ''}`]] : [])].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4>${[['held', '바디 활성화', entry.heldBody], ['idle', '바디 대기', entry.idleBody]].map(([state, title, body]) => `<figure><figcaption>${title}</figcaption><div class="sustain-stage" data-body-state="${state}" style="background-image:url('${body}')"><img src="${entry[key]}" width="200" height="40" alt="${entry.kind === 'single' ? '싱글' : '더블'} 유지 ${label}"></div></figure>`).join('')}<figure><figcaption>게임 배율 · 활성 바디</figcaption><div class="sustain-game"><div class="sustain-stage" data-body-state="game-held" style="background-image:url('${entry.heldBody}')"><img src="${entry[key]}" width="200" height="40" alt="게임 배율 유지 ${label}"></div></div></figure><nav aria-label="${entry.kind} ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}<p>윤곽선은 표식 자체의 경계를 구분하는 선입니다. Grace 외곽이나 별도 발광 효과가 아닙니다. 싱글은 44px 안을 선택했습니다. 더블 32px는 비교용이며, 게임 적용은 별도입니다.</p></section>`;
const releaseSymbol = `<section id="release-symbol" aria-labelledby="release-symbol-title"><h2 id="release-symbol-title">릴리즈 · 촘촘한 3단 10% 확대</h2><p>선택한 촘촘한 3단을 비율 그대로 10% 키웠습니다. 위부터 100%·80%·50%로 표시하며, 싱글 하나·더블 두 개의 중심은 광선에 맞췄습니다.</p><label class="release-guide-control"><input id="release-beam-guides" type="checkbox"> 광선 중심선 보기</label>${manifest.releaseSymbolPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison release-symbol-comparison" data-kind="${entry.kind}">${manifest.releaseSymbolPreview.comparisonIds.map(id => entry.variants.find(variant => variant.id === id)).map(variant => `<article data-variant="${variant.id}"><h4>${variant.id === 'triple-tight' ? '확대 전' : variant.label}</h4><figure><figcaption>활성 바디 끝</figcaption><div class="release-symbol-stage" style="--body:url('${entry.heldBody}')">${entry.symbolCenters.map(center => `<span class="release-beam-guide" style="left:${center}px" aria-hidden="true"></span>`).join('')}<img src="${variant.file}" width="200" height="40" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${variant.label}"></div></figure><figure><figcaption>게임 배율</figcaption><div class="sustain-game"><div class="release-symbol-stage" style="--body:url('${entry.heldBody}')">${entry.symbolCenters.map(center => `<span class="release-beam-guide" style="left:${center}px" aria-hidden="true"></span>`).join('')}<img src="${variant.file}" width="200" height="40" alt="게임 배율 릴리즈 ${variant.label}"></div></div></figure><nav aria-label="${entry.kind} 릴리즈 ${variant.label} 다운로드">${links(variant.file)}</nav></article>`).join('')}</div>`).join('')}<p>기존 J2-C 도안 위에 중앙 표시만 얹었습니다. 3단은 본체와 윤곽선이 함께 흐려집니다. 경로·선 두께·윤곽을 같은 비율로 키웠으며 아이콘 중심은 그대로입니다. <a href="https://lucide.dev/icons/chevrons-up" target="_blank" rel="noreferrer">참고한 이중 꺾쇠 아이콘 ↗</a></p></section>`;
const paletteAssembly = (entry, file, body) => `<div class="palette-assembly"><div class="palette-body" style="background-image:url('${body}')"></div><img class="palette-release" src="${file}" width="200" height="40" alt="릴리즈"><img class="palette-point" src="${entry.point}" width="212" height="40" alt="기준 포인트"></div>`;
const junctionCrops = (entry, key) => `<div class="junction-crops">${[['왼쪽', 80], ['오른쪽', 270]].map(([side, x]) => `<svg viewBox="${x} 20 50 50" role="img" aria-label="${entry.kind === 'single' ? '싱글' : '더블'} ${key === 'original' ? '수정 전' : key === 'previous' ? '직전 안' : '수정 후'} ${side} 접점 확대"><image href="${entry[key].replace('.png', '@2x.png')}" width="400" height="80"/></svg>`).join('')}</div>`;
const releaseSteppedJunctions = `<section id="release-stepped-junctions" aria-labelledby="release-stepped-junctions-title">
<h2 id="release-stepped-junctions-title">직전 시안 · 흰 띠 끝의 사선</h2>
<p>이 시안은 흰 띠 끝만 바뀌고 아래 접점이 갈라지지 않았습니다. <a href="#release-forked-junctions">아래 경계를 수정한 새 비교 보기</a></p>
${manifest.releaseJunctionPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['original', '수정 전'], ['candidate', '수정 후 · 짧은 단차']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>접점 확대 · 왼쪽 / 오른쪽</figcaption>${junctionCrops(entry, key)}</figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 단차 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const beamEndPreview = manifest.releaseBeamEndPreview;
const releaseStraightJunctions = `<section id="release-straight-junctions" aria-labelledby="release-straight-junctions-title">
<h2 id="release-straight-junctions-title">릴리즈 · 면의 폭과 직선 복원</h2>
<p>세 면의 꼭짓점은 유지하고, 긴 대각선 테두리와 가로 띠를 변형 전 원본으로 복원했습니다. 주변 면의 폭과 직선이 일정하게 이어집니다.</p>
${manifest.releaseStraightJunctionPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '직전 안 · 주변 면이 찌그러짐'], ['candidate', '수정안 · 원래 폭과 직선 유지']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>흰 띠 아래 접점 확대 · 왼쪽 / 오른쪽</figcaption>${junctionCrops(entry, key)}</figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 분기 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
<details><summary>변형 전 원본 테두리 확인</summary><div class="sustain-comparison palette-comparison">${manifest.releaseStraightJunctionPreview.kinds.map(entry => `<figure class="palette-detail"><figcaption>${entry.kind === 'single' ? '싱글' : '더블'} 원본</figcaption><img src="${entry.original.replace('.png', '@2x.png')}" width="400" height="80" alt="변형 전 원본 테두리">${junctionCrops(entry, 'original')}</figure>`).join('')}</div></details></section>`;
const celPreview = manifest.releaseCelBalancePreview;
const releaseCelBalance = `<section id="release-cel-balance" aria-labelledby="release-cel-balance-title">
<h2 id="release-cel-balance-title">릴리즈 · 셀 채색과 빛의 비중 4안</h2>
<p>선호한 형태는 유지하고 넓은 면의 명암과 광원 주변 그라데이션을 조율했습니다. 테두리·화살표·광선 끝의 위치는 같습니다.</p>
<div class="cel-overview">${[{ id: 'original', label: '기준 · 현재 안', note: '부드러운 그라데이션' }, ...celPreview.variants].map(variant => `<div class="cel-row" data-variant="${variant.id}"><div><h3>${escape(variant.label)}</h3><p>${escape(variant.note)}</p></div>${celPreview.kinds.map(entry => `<figure data-kind="${entry.kind}"><figcaption>${entry.kind === 'single' ? '싱글' : '더블'}</figcaption><img src="${(variant.id === 'original' ? entry.original : entry.variants.find(item => item.id === variant.id).file).replace('.png', '@2x.png')}" width="400" height="80" alt="${variant.label} ${entry.kind}" loading="lazy"></figure>`).join('')}</div>`).join('')}</div>
<h3 class="cel-assemblies-title">포인트·바디와 함께 보기</h3>
<div class="cel-cards">${celPreview.variants.map(variant => `<article data-variant="${variant.id}"><h4>${escape(variant.label)}</h4><p>${escape(variant.note)}</p><div class="cel-body-pair">${celPreview.kinds.map(entry => {
  const file = entry.variants.find(item => item.id === variant.id).file;
  return `<div data-kind="${entry.kind}"><figure><figcaption>${entry.kind === 'single' ? '싱글' : '더블'} · 바디 활성</figcaption>${paletteAssembly(entry, file, entry.heldBody)}</figure><figure><figcaption>게임 크기 · 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, file, body)}</div>`).join('')}</div></figure><nav aria-label="${variant.id} ${entry.kind} 다운로드">${links(file)}</nav></div>`;
}).join('')}</div></article>`).join('')}</div>
</section>`;
const releaseSimplifiedOriginal = `<section id="release-simplified-original" aria-labelledby="release-simplified-original-title">
<h2 id="release-simplified-original-title">원래 릴리즈 · 양옆 장식만 단순화</h2>
<p>기존 중앙 사선 면과 테두리를 그대로 살리고, 양옆의 흰 띠와 작은 면 분할만 덜었습니다. 화살표·광선 끝의 빛도 원본 그대로입니다.</p>
${manifest.releaseSimplifiedOriginalPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '기존 안 · 수평 접점'], ['candidate', '수정안 · 양옆 장식 정리']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 단순화 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const releaseSimpleFrame = `<section id="release-simple-frame" aria-labelledby="release-simple-frame-title">
<h2 id="release-simple-frame-title">이전 탐색 · 넓은 면과 끝 띠</h2>
<p>중앙의 방패형 홈과 분할 장식을 덜고, 포인트·바디처럼 넓은 면과 끝부분 띠로 정리했습니다. 기존 3단 화살표와 광선 끝의 빛은 같은 위치에 둡니다.</p>
${manifest.releaseSimpleFramePreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '기존 안 · 수평 접점'], ['candidate', '새 시안 · 넓은 면과 끝 띠']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 단순화 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const releaseHorizontalJunctions = `<section id="release-horizontal-junctions" aria-labelledby="release-horizontal-junctions-title">
<h2 id="release-horizontal-junctions-title">릴리즈 · 접점을 ㅡ로 수평 연결</h2>
<p>위로 꺾이던 짧은 선을 없애고, 가로 경계가 같은 높이로 안쪽 테두리까지 이어지게 했습니다. 단차는 면의 밝기 차이로 표현합니다.</p>
${manifest.releaseHorizontalJunctionPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '기존 안 · 위로 꺾이는 접점'], ['candidate', '수정안 · ㅡ 수평 연결']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>흰 띠 아래 접점 확대 · 왼쪽 / 오른쪽</figcaption>${junctionCrops(entry, key)}</figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 분기 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const releaseCleanJunctions = `<section id="release-clean-junctions" aria-labelledby="release-clean-junctions-title">
<h2 id="release-clean-junctions-title">이전 시안 · 주변 면이 찌그러진 꼭짓점</h2>
<p>꼭짓점의 구조는 맞지만 주변 면과 테두리가 변형된 이전 시안입니다. <a href="#release-straight-junctions">원래 폭과 직선을 복원한 수정안 보기</a></p>
${manifest.releaseCleanForkPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '직전 안 · 기존 사선이 남은 교차'], ['candidate', '수정안 · 세 면의 경계만 만남']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>흰 띠 아래 접점 확대 · 왼쪽 / 오른쪽</figcaption>${junctionCrops(entry, key)}</figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 분기 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const releaseForkedJunctions = `<section id="release-forked-junctions" aria-labelledby="release-forked-junctions-title">
<h2 id="release-forked-junctions-title">이전 시안 · 기존 사선이 남은 분기</h2>
<p>새 경계는 생겼지만 기존 사선이 남아 교차하는 시안입니다. <a href="#release-clean-junctions">기존 선을 지운 세 면의 꼭짓점 보기</a></p>
${manifest.releaseForkPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['previous', '직전 안 · 갈라지지 않은 접점'], ['candidate', '수정안 · 아래 경계에서 두 갈래']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 전체</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>흰 띠 아래 접점 확대 · 왼쪽 / 오른쪽</figcaption>${junctionCrops(entry, key)}</figure><figure><figcaption>바디 활성</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 분기 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
</section>`;
const releaseBeamEnds = `<section id="release-beam-ends" aria-labelledby="release-beam-ends-title">
<h2 id="release-beam-ends-title">더블 릴리즈 · 두 광선 끝에 빛 맞추기</h2>
<p>화살표 아래 띠의 밝은 지점을 각 광선 끝에 하나씩 놓았습니다. 가운데는 얇은 빛의 띠로 이어집니다.</p>
<div class="sustain-comparison palette-comparison">${[['original', '수정 전 · 가운데 한 지점'], ['candidate', '수정 후 · 광선마다 한 지점']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 확대</figcaption><img src="${beamEndPreview[key].replace('.png', '@2x.png')}" width="400" height="80" alt="더블 릴리즈 ${label}"></figure><figure><figcaption>두 광선과 연결 · 바디 활성</figcaption>${paletteAssembly(beamEndPreview, beamEndPreview[key], beamEndPreview.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[beamEndPreview.idleBody, beamEndPreview.heldBody].map(body => `<div class="palette-game">${paletteAssembly(beamEndPreview, beamEndPreview[key], body)}</div>`).join('')}</div></figure><nav aria-label="더블 릴리즈 ${label} 다운로드">${links(beamEndPreview[key])}</nav></article>`).join('')}</div>
<p>앞서 확인한 바디에 맞춘 색을 사용합니다. 싱글은 기존처럼 광선 하나에 밝은 지점 하나입니다.</p>
</section>`;
const releaseBodyColor = `<section id="release-body-color" aria-labelledby="release-body-color-title">
<h2 id="release-body-color-title">릴리즈와 바디 · 색만 맞추기</h2>
<p>바디 색을 기준으로 릴리즈의 색감을 맞췄습니다. 원래 J2-C의 면과 빛, 선택한 3단 표식을 사용합니다. 아래 포인트는 기존 색입니다.</p>
${manifest.paletteAnchorPreview.kinds.map(entry => {
  const original = entry.variants.find(variant => variant.id === 'original');
  const body = entry.variants.find(variant => variant.id === 'body');
  return `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['original', '원래 릴리즈', original.release], ['candidate', '바디에 색 맞춤', body.release]].map(([id, label, file]) => `<article data-variant="${id}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 확대</figcaption><img src="${file.replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>바디 활성 · 아래가 포인트</figcaption>${paletteAssembly(original, file, original.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[original.idleBody, original.heldBody].map(bodyFile => `<div class="palette-game">${paletteAssembly(original, file, bodyFile)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} ${label} 다운로드">${links(file)}</nav></article>`).join('')}</div>`;
}).join('')}
</section>`;
const releaseWideMaterial = `<section id="release-material-corrected" aria-labelledby="release-material-corrected-title">
<h2 id="release-material-corrected-title">릴리즈 · 넓은 중앙 면 + 흰빛 알파</h2>
<p>꺾쇠 뒤의 넓은 중앙 바탕면을 바디의 어두운 홈 색에 맞췄습니다. 5번은 원본 흰빛의 모양을 고정하고 알파만 바꿉니다. 4번의 명암 면은 이어서 사용합니다.</p>
${manifest.releaseWideMaterialPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-balance-comparison" data-kind="${entry.kind}">${entry.variants.map(variant => `<article data-white-alpha="${variant.whiteOpacity}"><h4>${variant.label}${variant.whiteOpacity === .5 ? ' · 비교 중심' : ''}</h4><figure class="palette-detail"><figcaption>같은 흰빛 · 같은 폭</figcaption><img src="${variant.file.replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${variant.label}"></figure><figure><figcaption>기존 바디 활성 · 아래가 포인트</figcaption>${paletteAssembly(entry, variant.file, entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, variant.file, body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} ${variant.label} 다운로드">${links(variant.file)}</nav></article>`).join('')}</div><details><summary>원본과 직전 시안 보기</summary><div class="sustain-comparison palette-comparison">${[['original', '원본'], ['previous', '직전 시안']].map(([key, label]) => `<figure class="palette-detail"><figcaption>${label}</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure>`).join('')}</div></details>`).join('')}
<p>흰빛은 합쳐진 원본에서 추정 분리한 레이어입니다. 0%는 흰빛 아래 바탕색을 추정한 모습이며, 원래 제작 파일의 숨겨진 레이어를 복원한 것은 아닙니다.</p>
</section>`;
const releaseMaterial = `<section id="release-material" aria-labelledby="release-material-title">
<h2 id="release-material-title">직전 시안 · 3·4·5번 재질 수정</h2>
<p><a href="#release-parts">부위 번호 보기</a> · 3번은 광선 주변 같은 어두운 홈, 4번은 밝은 면·중간 면·그늘 면, 5번은 강도를 낮춘 가로빛으로 바꾼 시안입니다.</p>
${manifest.releaseMaterialPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['original', '기존'], ['candidate', '수정안 · 바디처럼 명암 나누기']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure class="palette-detail"><figcaption>릴리즈 확대</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><figure><figcaption>기존 바디 활성 · 아래가 포인트</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><nav aria-label="${entry.kind} 릴리즈 ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
<p>같은 포인트·바디에 연결해 비교합니다. 4번은 단색으로 덮지 않고 명암이 구분되는 면으로 나눴습니다. 중앙 꺾쇠의 비율·위치와 8번 흰빛의 중심은 원본을 유지합니다.</p>
</section>`;
const releasePalette = `<section id="release-palette" aria-labelledby="release-palette-title">
<h2 id="release-palette-title">릴리즈 · 포인트와 색 맞추기</h2>
<p>청록빛과 샛노랑을 줄여 하늘색·크림 골드 계열로 맞춘 시안입니다. 같은 포인트와 바디에 연결해 이전 색과 비교합니다.</p>
${manifest.releasePalettePreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글 · 하늘색' : '더블 · 크림 골드'}</h3><div class="sustain-comparison palette-comparison" data-kind="${entry.kind}">${[['original', '이전 색'], ['candidate', '포인트에 맞춘 색']].map(([key, label]) => `<article data-variant="${key}"><h4>${label}</h4><figure><figcaption>바디 활성 · 아래가 포인트</figcaption>${paletteAssembly(entry, entry[key], entry.heldBody)}</figure><figure><figcaption>게임 배율 · 바디 대기 / 활성</figcaption><div class="palette-game-pair">${[entry.idleBody, entry.heldBody].map(body => `<div class="palette-game">${paletteAssembly(entry, entry[key], body)}</div>`).join('')}</div></figure><figure class="palette-detail"><figcaption>릴리즈 확대</figcaption><img src="${entry[key].replace('.png', '@2x.png')}" width="400" height="80" alt="${entry.kind === 'single' ? '싱글' : '더블'} 릴리즈 ${label}"></figure><nav aria-label="${entry.kind} ${label} 다운로드">${links(entry[key])}</nav></article>`).join('')}</div>`).join('')}
<p>원래 도안의 명암 배치·외곽과 선택한 3단 표식을 유지했습니다. 새 색은 비교용 시안입니다.</p>
</section>`;
const paletteAnchors = `<section id="palette-anchors" aria-labelledby="palette-anchors-title">
<h2 id="palette-anchors-title">색 기준 · 포인트 / 릴리즈 / 바디</h2>
<p>기준으로 삼은 에셋은 그대로 두고 나머지 둘의 색을 맞췄습니다. 포인트 기준은 앞선 색 방향에 바디까지 맞춘 안입니다. 모양과 명암 배치는 유지합니다.</p>
${manifest.paletteAnchorPreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-anchor-comparison" data-kind="${entry.kind}">${entry.variants.map(variant => `<article data-anchor="${variant.id}"><h4>${variant.label}</h4><figure><figcaption>바디 활성</figcaption>${paletteAssembly(variant, variant.release, variant.heldBody)}</figure><figure><figcaption>게임 배율 · 대기 / 활성</figcaption><div class="palette-game-pair">${[variant.idleBody, variant.heldBody].map(body => `<div class="palette-game">${paletteAssembly(variant, variant.release, body)}</div>`).join('')}</div></figure><details><summary>에셋 다운로드</summary>${[['point', '포인트'], ['idleBody', '바디 대기'], ['heldBody', '바디 활성'], ['release', '릴리즈']].map(([key, label]) => `<nav aria-label="${entry.kind} ${variant.label} ${label} 다운로드"><span>${label}</span>${links(variant[key])}</nav>`).join('')}</details></article>`).join('')}</div>`).join('')}
<p>어느 기준을 선택할지 비교하는 시안입니다. 릴리즈의 3단 표시와 광선 중심 정렬은 같습니다.</p>
</section>`;
const paletteBalance = `<section id="palette-balance" aria-labelledby="palette-balance-title">
<h2 id="palette-balance-title">포인트 유지 · 중간 강도 2안</h2>
<p>포인트의 밝은 하늘색·크림 골드는 그대로 둡니다. 바디는 조금, 릴리즈는 그보다 더 색을 조정해 원래의 선명함을 살리면서 연결감을 맞췄습니다.</p>
${manifest.paletteBalancePreview.kinds.map(entry => `<h3>${entry.kind === 'single' ? '싱글' : '더블'}</h3><div class="sustain-comparison palette-balance-comparison" data-kind="${entry.kind}">${entry.variants.map(variant => `<article data-balance="${variant.id}"><h4>${variant.label}</h4><figure><figcaption>바디 활성 · 포인트 원본 유지</figcaption>${paletteAssembly(variant, variant.release, variant.heldBody)}</figure><figure><figcaption>게임 배율 · 대기 / 활성</figcaption><div class="palette-game-pair">${[variant.idleBody, variant.heldBody].map(body => `<div class="palette-game">${paletteAssembly(variant, variant.release, body)}</div>`).join('')}</div></figure><details><summary>에셋 다운로드</summary>${[['idleBody', '바디 대기'], ['heldBody', '바디 활성'], ['release', '릴리즈']].map(([key, label]) => `<nav aria-label="${entry.kind} ${variant.label} ${label} 다운로드"><span>${label}</span>${links(variant[key])}</nav>`).join('')}</details></article>`).join('')}</div>`).join('')}
<p>A는 원색이 더 남고, B는 포인트 쪽 색감에 조금 더 가까워집니다. 두 안 모두 같은 모양·명암 배치·3단 표시를 사용합니다.</p>
</section>`;
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Classic 상태별 에셋 검토</title><link rel="stylesheet" href="style.css"></head>
<body><main><header><a href="../../">← Lab 목록</a><p class="edition">Classic · 판정 연결 준비</p><h1>상태별 에셋 검토</h1><p>확정 도안으로 만든 유지·실패·몫별 표시 시안입니다. 확정한 성공·실패 표시와 검토 중인 색의 강도를 구분해 확인합니다.</p><p>릴리즈도 최종 C안(J2-C)을 사용합니다. D 매듭은 유지 표식입니다. 바디와 유지 표식에는 Grace를 붙이지 않습니다.</p><nav class="jump"><a href="#release-cel-balance">셀 채색 4안</a><a href="#release-simplified-original">원형 유지 단순화</a><a href="#release-simple-frame">릴리즈 단순화</a><a href="#release-horizontal-junctions">ㅡ 수평 연결</a><a href="#release-straight-junctions">면과 직선 복원</a><a href="#release-clean-junctions">세 면의 꼭짓점</a><a href="#release-forked-junctions">아래 접점 분기</a><a href="#release-stepped-junctions">단차 수정 전후</a><a href="#release-junction">단차 접점</a><a href="#release-beam-ends">더블 빛 두 지점</a><a href="#release-body-color">릴리즈·바디 색</a><a href="#release-material-corrected">넓은 면·흰빛 알파</a><a href="#release-material">3·4·5번 수정안</a><a href="#release-parts">릴리즈 부위 번호</a><a href="#palette-balance">중간 강도 2안</a><a href="#palette-anchors">이전 색 기준 3안</a><a href="#release-palette">릴리즈 색 전후</a><a href="#release-symbol">릴리즈 표식</a><a href="#sustain-visibility">유지 가독성</a><a href="#point-success">포인트 일부 성공</a><a href="#release-success">릴리즈 일부 성공</a><a href="#body-double">바디</a><a href="#body-boundaries">바디 시작·끝</a><a href="#point-double">누름</a><a href="#sustain-double">유지</a><a href="#release-double">릴리즈</a><a href="#sustain-layers">남은 몫</a></nav></header>
${releaseCelBalance}
${releaseSimplifiedOriginal}
${releaseSimpleFrame}
${releaseHorizontalJunctions}
${releaseStraightJunctions}
${releaseCleanJunctions}
${releaseForkedJunctions}
${releaseSteppedJunctions}
${releaseJunctionHtml}
${releaseBeamEnds}
${releaseBodyColor}
${releaseWideMaterial}
${releaseMaterial}
${releasePartsHtml}
${paletteBalance}
${paletteAnchors}
${releasePalette}
${releaseSymbol}
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
#sustain-visibility>h3,#release-symbol>h3{font-size:17px;min-height:0;margin:32px 0 14px}
.sustain-comparison h4{font-size:15px;margin:0 0 22px}
.sustain-comparison figure{margin:0 0 22px}
.sustain-comparison figcaption{font-size:12px;color:#b5c4d5;text-align:center;margin-bottom:8px}
.sustain-stage{position:relative;width:200px;height:112px;margin:auto;background-size:200px 40px}
.sustain-stage img{position:absolute;top:36px;left:0;width:200px;height:40px}
.sustain-game{width:59px;height:34px;margin:auto}
.sustain-game .sustain-stage,.sustain-game .release-symbol-stage{transform:scale(0.29481132);transform-origin:top left}
.release-symbol-comparison{grid-template-columns:repeat(2,minmax(0,1fr))}
.palette-comparison{grid-template-columns:repeat(2,minmax(0,1fr))}
.palette-anchor-comparison{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.palette-anchor-comparison figure{margin-inline:0}
.palette-anchor-comparison details nav{gap:8px}
.palette-anchor-comparison details nav span{width:100%;color:#b5c4d5}
.palette-balance-comparison{grid-template-columns:repeat(3,minmax(0,1fr))}
.palette-balance-comparison details nav{gap:8px}
.palette-balance-comparison details nav span{width:100%;color:#b5c4d5}
@media(max-width:820px){.palette-balance-comparison{grid-template-columns:1fr}}
@media(max-width:1080px){.palette-anchor-comparison{grid-template-columns:repeat(2,minmax(0,1fr))}}
.palette-assembly{position:relative;width:212px;height:184px;margin:auto}
.palette-body{position:absolute;left:6px;top:20px;width:200px;height:144px;background-size:200px 40px}
.palette-release{position:absolute;left:6px;top:0;width:200px;height:40px}
.palette-point{position:absolute;left:0;top:144px;width:212px;height:40px}
.palette-game-pair{display:flex;justify-content:center;gap:24px}
.palette-game{width:62.5px;height:55px}
.palette-game .palette-assembly{transform:scale(0.29481132);transform-origin:top left}
.palette-detail{margin-inline:0}
.palette-detail img{display:block;width:400px;max-width:100%;height:auto;margin:auto}
@media(max-width:1040px){.release-symbol-comparison{grid-template-columns:repeat(2,minmax(0,1fr))}}
.release-guide-control{display:inline-flex;align-items:center;gap:8px;min-height:40px;font-size:14px;color:#b5c4d5;cursor:pointer}
.release-guide-control input{accent-color:#f493ca}
.release-beam-guide{display:none;position:absolute;top:0;bottom:0;border-left:1px dashed #fa95cc;transform:translateX(-.5px);z-index:2;pointer-events:none}
#release-symbol:has(#release-beam-guides:checked) .release-beam-guide{display:block}
.release-symbol-stage{position:relative;width:200px;height:112px;margin:auto}
.release-symbol-stage::before{content:"";position:absolute;top:32px;bottom:0;left:0;right:0;background-image:var(--body);background-size:200px 40px}
.release-symbol-stage img{position:absolute;left:0;top:12px;width:200px;height:40px}
@media(max-width:600px){.sustain-comparison{grid-template-columns:1fr}}
@media(max-width:880px){.success-comparison{grid-template-columns:1fr}.success-comparison article{max-width:440px;width:100%;margin:auto}}
@media(max-width:600px){.boundary-comparison{grid-template-columns:1fr}}
@media(max-width:760px){.success-comparison{grid-template-columns:1fr}.success-comparison article{max-width:440px;width:100%;margin:auto}}
@media(max-width:600px){main{padding:24px 16px}.states{grid-template-columns:1fr}article{padding-inline:8px}h3{min-height:0}}
.cel-overview{display:grid;gap:20px}.cel-row{display:grid;grid-template-columns:170px minmax(0,1fr) minmax(0,1fr);align-items:center;gap:20px;border-top:1px solid #303945;padding-top:18px}.cel-row h3{min-height:0;margin:0 0 6px}.cel-row p{font-size:12px;margin:0}.cel-row figure{margin:0}.cel-row figcaption,.cel-body-pair figcaption{text-align:center;color:#b5c4d5;font-size:12px;margin-bottom:10px}.cel-row img{display:block;width:100%;height:auto;max-width:400px;margin:auto}.cel-assemblies-title{margin-top:36px;min-height:0}.cel-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.cel-cards h4{margin:0}.cel-body-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cel-body-pair figure{margin:0 0 18px}.cel-body-pair nav{justify-content:center}.cel-body-pair .palette-game-pair{gap:8px}@media(max-width:1000px){.cel-cards{grid-template-columns:1fr}}@media(max-width:650px){.cel-row{grid-template-columns:1fr;gap:14px}.cel-body-pair{grid-template-columns:1fr}.cel-body-pair>div+div{margin-top:20px}}
${releaseJunctionCss.trimEnd()}
${releasePartsCss.trimEnd()}\n`);
console.log('Lab gallery: /lab/images/classic-approved-states-20261025/');
