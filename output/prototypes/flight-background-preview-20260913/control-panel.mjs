// 일반 보기에서는 아래 패널을 유지하고, 화면만 보기에서만 여닫는다.
export function setupControlPanel(body, button, panel) {
  const sceneOnly = () => body.classList.contains('scene-only');
  const sync = () => {
    button.setAttribute('aria-expanded', String(!sceneOnly() || body.classList.contains('panel-open')));
    button.setAttribute('title', sceneOnly() ? '조절 패널 열기/닫기' : '아래 조절로 이동');
  };
  const reset = () => {
    body.classList.remove('panel-open');
    sync();
  };
  button.addEventListener('click', () => {
    if (sceneOnly()) body.classList.toggle('panel-open');
    else panel.scrollIntoView({block:'start', behavior:'auto'});
    sync();
  });
  reset();
  return {reset};
}
