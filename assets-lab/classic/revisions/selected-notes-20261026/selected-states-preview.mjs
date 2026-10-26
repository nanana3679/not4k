export function selectedStatesHtml(preview, links) {
  const stage = (group, state, small = false) => `<div class="selected-state-stage${small ? ' selected-state-small' : ''}" style="--state-width:${group.targetSize[0]}px;--state-body:url('${group.role === 'body' ? state.file : group.body}')">
    <img class="selected-state-note" src="${state.file}" width="${group.targetSize[0]}" height="40" style="opacity:${state.alpha ?? 1}" alt="${group.label} ${state.label}">
    ${state.overlay ? `<img class="selected-state-overlay" src="${state.overlay}" width="${group.overlaySize[0]}" height="88" style="opacity:${state.overlayAlpha}" alt="전체 Grace 외곽">` : ''}
  </div>`;
  const cards = group => `<div class="selected-state-grid" data-group="${group.id}">${group.states.map(state => `<article data-state="${state.id}"><h4>${state.label}</h4>${stage(group, state)}<p class="selected-state-caption">게임 크기</p><div class="selected-state-small-frame">${stage(group, state, true)}</div><nav>${links(state.composite ?? state.file)}</nav></article>`).join('')}</div>`;
  const overviewGroups = ['release-double', 'sustain-double'].map(id => preview.groups.find(group => group.id === id));
  return `<section id="selected-states" aria-labelledby="selected-states-title">
    <h2 id="selected-states-title">선택 팔레트 · 파생 에셋</h2>
    <p>파랑 50%·금색 75%, 릴리즈 A안과 확대된 유지 표식을 기준으로 만든 상태별 도안입니다. 실패한 부분은 무채색·45% 밝기입니다. 유지는 성공한 쪽만 사라지고, 대기 표식의 위치·크기·밝기를 유지하며 실패한 표식은 실패색으로 남깁니다.</p>
    <div id="selected-states-overview"><h3>더블 릴리즈의 실패 · 유지의 일부 성공</h3>
    ${overviewGroups.map(group => `<div class="selected-state-overview-row" data-role="${group.role}"><h4>${group.label}</h4>${(group.role === 'sustain' ? ['pending', 'partial-success-left', 'partial-success-right', 'success'] : ['pending', 'partial-failed-left', 'partial-failed-right', 'failed']).map(id => {
      const state = group.states.find(state => state.id === id);
      return `<figure><figcaption>${state.label}</figcaption>${stage(group, state)}</figure>`;
    }).join('')}</div>`).join('')}
    <p>유지는 바디 실패로 아직 내려오는 표식도 종속 0점이 될 수 있습니다. 실패한 표식은 원래 위치에서 스크롤하여 화면 밖까지 남고, 성공한 쪽만 숨깁니다.</p>
    <div class="selected-state-overview-row" data-role="sustain-failed"><h4>더블 유지 · 실패와 성공 혼합</h4>${['partial-failed-left', 'partial-failed-right', 'success-left-failed-right', 'success-right-failed-left'].map(id => {
      const group = preview.groups.find(group => group.id === 'sustain-double');
      const state = group.states.find(state => state.id === id);
      return `<figure><figcaption>${state.label}</figcaption>${stage(group, state)}</figure>`;
    }).join('')}</div>
    <p>누름·릴리즈의 Grace는 전체 외곽을 따라갑니다. 일부 성공은 본체 전체 70%·외곽 100%이며 모두 성공하면 둘 다 숨깁니다.</p>
    <div class="selected-state-overview-row" data-role="grace"><h4>더블 릴리즈 Grace</h4>${['pending', 'partial-failed-left', 'partial-failed-right', 'partial-success'].map(id => {
      const group = preview.graceGroups.find(group => group.id === 'release-double-grace');
      const state = group.states.find(state => state.id === id);
      return `<figure><figcaption>${state.label}</figcaption>${stage(group, state)}</figure>`;
    }).join('')}</div>
    <div class="selected-state-overview-row" data-role="release-mixed"><h4>더블 릴리즈 · 성공·실패 혼합 / Grace</h4>${[false, true].flatMap(grace => ['left', 'right'].map(side => {
      const group = (grace ? preview.graceGroups : preview.groups).find(group => group.id === `release-double${grace ? '-grace' : ''}`);
      const state = group.states.find(state => state.id === `success-${side}-failed-${side === 'left' ? 'right' : 'left'}`);
      return `<figure><figcaption>${grace ? 'Grace · ' : ''}${state.label}</figcaption>${stage(group, state)}</figure>`;
    })).join('')}</div></div>
    <p><a href="selected-states-preview.png" download>파생 에셋 비교 PNG</a></p>
    <details class="selected-state-downloads"><summary>싱글·더블 전체 상태와 PNG·2배 PNG·SVG 다운로드</summary>
      ${preview.groups.map(group => `<h3>${group.label}</h3>${cards(group)}`).join('')}
      ${preview.graceGroups.map(group => `<h3>${group.label}</h3>${cards(group)}`).join('')}
      <h3>Grace 별도 overlay</h3><nav>${Object.entries(preview.graceOverlays).map(([role, file]) => `<span>${role === 'point' ? '누름' : '릴리즈'}</span>${links(file)}`).join('')}</nav>
      ${preview.layers.map(group => `<h3>${group.label} · 합성 재료</h3>${cards(group)}`).join('')}
    </details>
    <p>바디·유지에는 Grace를 붙이지 않습니다. 유지의 좌우 레이어는 각 몫의 대기·실패를 표시하며 성공한 몫만 숨깁니다. 릴리즈 성공·실패 혼합은 부분 실패 도안 전체를 70%로 남기고 Grace 외곽은 100%로 유지합니다.</p>
  </section>`.replace(/[ \t]+\n/g, '\n');
}

export const selectedStatesCss = `
.selected-state-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}.selected-state-grid article{padding:14px 0}.selected-state-grid h4{font-size:14px;margin:0 0 12px}.selected-state-stage{position:relative;width:calc(var(--state-width) + 48px);height:104px;margin:auto;background:#080c12}.selected-state-stage:before{content:'';position:absolute;left:50%;transform:translateX(-50%);width:200px;height:104px;background-image:var(--state-body);background-size:200px 40px}.selected-state-note{position:absolute;left:24px;top:32px;max-width:none}.selected-state-overlay{position:absolute;left:0;top:8px;max-width:none}.selected-state-small-frame{height:36px;width:77px;margin:auto;overflow:visible}.selected-state-small{transform:scale(.2948113208);transform-origin:top left}.selected-state-caption{text-align:center;font-size:11px;margin:10px 0 6px}.selected-state-downloads{margin-top:24px}.selected-state-downloads>h3{font-size:18px;min-height:0;margin:28px 0 12px}.selected-state-downloads>nav{display:flex;gap:12px;flex-wrap:wrap}.selected-state-overview-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.selected-state-overview-row>h4{grid-column:1/-1;margin:22px 0 0}.selected-state-overview-row figure{margin:0;min-width:0}.selected-state-overview-row figcaption{font-size:12px;text-align:center;color:#b5c4d5;min-height:36px;margin-bottom:8px}.selected-state-overview-row .selected-state-stage{max-width:100%;overflow:hidden}#selected-states-overview>h3{font-size:16px;margin-top:24px;min-height:0}@media(max-width:1000px){.selected-state-overview-row{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.selected-state-overview-row{grid-template-columns:1fr}}`;
