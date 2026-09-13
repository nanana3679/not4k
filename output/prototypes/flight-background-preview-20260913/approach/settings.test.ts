import {describe, it, expect} from 'vitest';
import {initialView} from './settings.mjs';
describe('이륙·침투의 링크 복원', () => {
  it('빈 링크는 이륙·고도 68%·재생으로 시작한다', () => {
    expect(initialView('')).toEqual({scenario:'liftoff', altitude:.68, running:true});
  });
  it('variant=infiltration은 침투·고도 23%를 기본값으로 사용한다', () => {
    expect(initialView('?variant=infiltration').altitude).toBe(.23);
  });
  it('고도 10%·일시정지 링크는 새로고침 후에도 10%·정지로 복원한다', () => {
    expect(initialView('?variant=infiltration&altitude=.1&paused=1')).toEqual({scenario:'infiltration', altitude:.1, running:false});
  });
  it('잘못된 고도는 기본값으로, -1과 2는 3%와 95%로 제한한다', () => {
    expect(initialView('?altitude=no').altitude).toBe(.68);
    expect(initialView('?altitude=-1').altitude).toBe(.03);
    expect(initialView('?altitude=2').altitude).toBe(.95);
  });
  it('움직임 줄이기를 켜면 정지하며 명시적인 paused=0으로만 재생한다', () => {
    expect(initialView('', true).running).toBe(false);
    expect(initialView('?paused=0', true).running).toBe(true);
  });
});
