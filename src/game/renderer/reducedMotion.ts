/**
 * 운영체제·브라우저의 움직임 줄이기 설정(`prefers-reduced-motion: reduce`). 비행 배경과 프레임 움직임이 렌더러를 만들 때 한 번 읽는다.
 * matchMedia가 없는 환경(서버 렌더·단위 테스트)은 움직임 줄이기가 아닌 것으로 본다.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
