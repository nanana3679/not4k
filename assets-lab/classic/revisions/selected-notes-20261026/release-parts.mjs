// Review annotations in the original 400×80 artwork coordinates; never skin assets.
const parts = [
  { id: 1, label: '중앙 바탕면', detail: '꺾쇠 뒤의 넓은 면', badge: [520, 34], target: [268, 17], region: '<path d="M94 3H306L277 62H123Z"/>' },
  { id: 2, label: '3단 꺾쇠', detail: '위로 향하는 표시 · 더블은 두 묶음', badge: [350, 34], target: [200, 17] },
  { id: 3, label: '중앙 테두리 빛', detail: '중앙 면을 감싼 U자 빛줄기', badge: [530, 266], target: [288, 47], region: '<path class="part-line" d="M91 2L121 66H279L309 2"/>' },
  { id: 4, label: '양옆 윗면', detail: '가로 빛줄기 위의 면', badge: [170, 34], target: [59, 12], region: '<path d="M14 3H87L96 22H25ZM313 3H386L375 22H304Z"/>' },
  { id: 5, label: '양옆 가로 빛', detail: '양쪽에 길게 뻗은 밝은 줄', badge: [70, 266], target: [50, 28], region: '<path class="part-line" d="M26 28H98M302 28H374"/>' },
  { id: 6, label: '양옆 아랫면', detail: '가로 빛줄기 아래의 넓은 면', badge: [210, 266], target: [62, 60], region: '<path d="M25 48H94L108 76H7ZM306 48H375L393 76H292Z"/>' },
  { id: 7, label: '양끝 세로 띠', detail: '가장 왼쪽·오른쪽의 꺾인 띠', badge: [50, 34], target: [8, 33], region: '<path d="M1 2H11L31 44L23 47L4 77H1ZM389 2H399V77H396L377 47L369 44Z"/>' },
  { id: 8, label: '중앙 아래 흰빛', detail: '테두리 가운데의 가장 밝은 번짐', badge: [350, 266], target: [200, 67], region: '<ellipse cx="200" cy="67" rx="19" ry="7"/>' },
];

const diagram = kind => `<svg class="release-parts-diagram" viewBox="0 0 700 300" role="img" aria-labelledby="release-parts-${kind}-title release-parts-${kind}-desc">
<title id="release-parts-${kind}-title">${kind === 'single' ? '싱글' : '더블'} 릴리즈 부위 번호</title>
<desc id="release-parts-${kind}-desc">${parts.map(part => `${part.id}번 ${part.label}`).join(', ')}. 좌우 같은 부위는 같은 번호입니다.</desc>
<image href="assets/release-${kind}-chevron-triple-tight-large@2x.png" x="50" y="90" width="600" height="120"/>
<g transform="translate(50 90) scale(1.5)">${parts.map(part => `<g class="release-part-region" data-part="${part.id}">${part.region ?? (kind === 'single' ? '<rect x="181" y="12" width="38" height="41" rx="3"/>' : '<rect x="149" y="12" width="38" height="41" rx="3"/><rect x="213" y="12" width="38" height="41" rx="3"/>')}</g>`).join('')}</g>
${parts.map(part => {
  const [x, y] = part.badge;
  const targetX = 50 + part.target[0] * 1.5;
  const targetY = 90 + part.target[1] * 1.5;
  const bendY = y < 90 ? 68 : 234;
  // For double, point to the left group rather than the empty gap between groups.
  const tipX = part.id === 2 && kind === 'double' ? 50 + 168 * 1.5 : targetX;
  return `<g class="release-part-callout" data-part="${part.id}"><path class="part-leader" d="M${x} ${y}V${bendY}L${tipX} ${targetY}"/><circle class="part-tip" cx="${tipX}" cy="${targetY}" r="3.5"/><circle class="part-badge" cx="${x}" cy="${y}" r="20"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${part.id}</text></g>`;
}).join('')}
</svg>`;

export const releasePartsHtml = `<section id="release-parts" aria-labelledby="release-parts-title">
<h2 id="release-parts-title">릴리즈 · 부위 번호</h2>
<p>싱글·더블에 같은 번호를 붙였습니다. 아래 번호를 누르면 양쪽 그림에서 해당 부위가 강조됩니다. “5번을 덜 쨍하게”, “더블 왼쪽 7번”처럼 말하면 됩니다.</p>
<fieldset class="release-parts-controls"><legend>강조할 부위</legend>
<label class="release-part-reset"><input type="radio" name="release-part" value="all" checked> 전체 보기</label>
<div class="release-parts-options">${parts.map(part => `<label><input type="radio" name="release-part" value="${part.id}"><span class="part-option-number">${part.id}</span><span><strong>${part.label}</strong><small>${part.detail}</small></span></label>`).join('')}</div></fieldset>
${['single', 'double'].map(kind => `<article class="release-parts-row" data-kind="${kind}"><h3>${kind === 'single' ? '싱글' : '더블'}</h3><div class="release-parts-pair">${diagram(kind)}<figure class="release-parts-original"><figcaption>번호 없는 원본</figcaption><img src="assets/release-${kind}-chevron-triple-tight-large@2x.png" width="400" height="80" alt="${kind === 'single' ? '싱글' : '더블'} 릴리즈 원본"></figure></div></article>`).join('')}
<p>좌우에 반복되는 부위는 같은 번호입니다. 색을 조정하기 전의 릴리즈와 선택한 촘촘한 3단 표식을 기준으로 구분했습니다.</p>
</section>`;

export const releasePartsCss = `
.release-parts-controls{border:0;margin:24px 0;padding:0}
.release-parts-controls legend{font-size:13px;color:#b5c4d5;margin-bottom:12px}
.release-parts-controls label{cursor:pointer}
.release-part-reset{display:flex;align-items:center;gap:8px;min-height:44px;width:fit-content;font-size:14px}
.release-parts-controls input{accent-color:#f7b2d8}
.release-parts-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.release-parts-options label{position:relative;display:flex;align-items:center;gap:10px;padding:10px 8px;border:1px solid #303945;border-radius:4px;min-height:72px}
.release-parts-options input{position:absolute;opacity:0;width:1px;height:1px}
.release-parts-options label:has(input:focus-visible){outline:2px solid #f7b2d8;outline-offset:3px}
.release-parts-options label:has(input:checked){border-color:#f7b2d8;background:#2d202c}
.part-option-number{flex:none;display:grid;place-items:center;width:26px;height:26px;border:1px solid #8995a4;border-radius:50%;font-size:14px;font-weight:700}
.release-parts-options strong{display:block;font-size:13px}
.release-parts-options small{display:block;color:#b5c4d5;font-size:11px;line-height:1.6;margin-top:4px}
.release-parts-row{padding-inline:0}
.release-parts-row h3{min-height:0;margin-bottom:0;font-size:16px}
.release-parts-pair{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:20px;align-items:center}
.release-parts-diagram{display:block;width:100%;height:auto;overflow:visible}
.release-parts-original{margin:0}
.release-parts-original figcaption{color:#b5c4d5;font-size:12px;margin-bottom:12px}
.release-parts-original img{display:block;width:100%;height:auto}
.release-part-region{opacity:0;fill:#ffaad8;fill-opacity:.18;stroke:#ffaad8;stroke-width:1.5;stroke-linejoin:round}
.release-part-region .part-line{fill:none;stroke-width:4}
.part-leader{fill:none;stroke:#f4f5f8;stroke-width:1.6;paint-order:stroke;filter:drop-shadow(0 1px 1px #03050b)}
.part-tip{fill:#fff;stroke:#0b0e13;stroke-width:1.5}
.part-badge{fill:#151c27;stroke:#b5c4d5;stroke-width:1.5}
.release-part-callout text{fill:#fff;font:700 22px system-ui,sans-serif}
#release-parts:has(input:not([value="all"]):checked) .release-part-callout{opacity:.2}
${parts.map(part => `#release-parts:has(input[value="${part.id}"]:checked) [data-part="${part.id}"]{opacity:1}
#release-parts:has(input[value="${part.id}"]:checked) .release-part-callout[data-part="${part.id}"] .part-badge{stroke:#ffaad8;fill:#402638}`).join('\n')}
@media(max-width:850px){.release-parts-options{grid-template-columns:repeat(2,minmax(0,1fr))}.release-parts-pair{grid-template-columns:1fr;gap:0}.release-parts-original{width:200px;margin:0 auto 20px}.release-parts-original figcaption{text-align:center}}
@media(max-width:450px){.release-parts-options label{padding:8px 6px;gap:6px}.release-parts-options small{font-size:10px}.release-parts-options strong{font-size:12px}.release-part-callout text{font-size:28px}.part-badge{r:24px}}
`;
