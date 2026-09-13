import {describe, expect, it, vi} from 'vitest';
import {skyBrightness, dimSky} from './sky-lighting.mjs';

describe('이륙 고도에 따른 지평선 위 배경 밝기', () => {
  it('고도 3%에서는 기존 밝기의 15%, 고도 95%에서는 기존 밝기 100%다', () => {
    expect(skyBrightness(.03)).toBe(.15);
    expect(skyBrightness(.95)).toBe(1);
  });
  it('고도 범위의 중간인 49%에서는 기존 밝기의 57.5%다', () => {
    expect(skyBrightness(.49)).toBeCloseTo(.575,12);
  });
  it('고도 -100~200%에서 밝기는 단조 증가하며 15~100%를 넘지 않는다', () => {
    let previous=.15;
    for(let i=-100;i<=200;i++){
      const brightness=skyBrightness(i/100);
      expect(brightness).toBeGreaterThanOrEqual(previous);
      expect(brightness).toBeGreaterThanOrEqual(.15);
      expect(brightness).toBeLessThanOrEqual(1);
      previous=brightness;
    }
  });
  it('고도 3%와 95% 경계 양옆 0.01%에서 밝기가 갑자기 바뀌지 않는다', () => {
    for(const a of [.03,.95])expect(Math.abs(skyBrightness(a-.0001)-skyBrightness(a+.0001))).toBeLessThan(.000001);
  });
  it('NaN과 Infinity 고도는 기존 최대 밝기로 처리한다', () => {
    expect(skyBrightness(NaN)).toBe(1);
    expect(skyBrightness(Infinity)).toBe(1);
  });
});

const context=()=>({save:vi.fn(),restore:vi.fn(),fillRect:vi.fn(),fillStyle:'',globalAlpha:1});
const view={altitude:.03,width:1000,height:600,horizon:180,showSky:true};
describe('하늘 레이어에만 적용하는 감광', () => {
  it('지평선 y=180이면 그 위 1000×180만 어둡게 하고 렌더링 상태를 복원한다', () => {
    const c=context();dimSky(c,view);
    expect(c.save).toHaveBeenCalledOnce();
    expect(c.fillRect).toHaveBeenCalledExactlyOnceWith(0,0,1000,180);
    expect(c.globalAlpha).toBe(.85);
    expect(c.fillStyle).toBe('#000');
    expect(c.restore).toHaveBeenCalledOnce();
  });
  it('고도 95%에서는 감광을 전혀 그리지 않아 기존 최대 밝기 픽셀을 유지한다', () => {
    const c=context();dimSky(c,{...view,altitude:.95});
    expect(c.fillRect).not.toHaveBeenCalled();
    expect(c.save).not.toHaveBeenCalled();
  });
  it('지평선이 화면 위인 -10과 0이거나 하늘이 없으면 아무것도 그리지 않는다', () => {
    for(const v of [{...view,horizon:-10},{...view,horizon:0},{...view,showSky:false}]){
      const c=context();dimSky(c,v);expect(c.fillRect).not.toHaveBeenCalled();
    }
  });
  it('지평선 y=900이 높이 600 화면 아래에 있어도 감광 영역은 높이 600을 넘지 않는다', () => {
    const c=context();dimSky(c,{...view,horizon:900});
    expect(c.fillRect).toHaveBeenCalledExactlyOnceWith(0,0,1000,600);
  });
});
