import {it,expect} from 'vitest';
import {renderPixelRatio} from './render-quality.mjs';

it('390px 모바일에서 기기 DPR3은 렌더 DPR1로 제한한다',()=>{expect(renderPixelRatio(3,390)).toBe(1);});
it('560px 경계에서 기기 DPR2는 렌더 DPR1로 제한한다',()=>{expect(renderPixelRatio(2,560)).toBe(1);});
it('561px 데스크톱에서 기기 DPR3은 렌더 DPR1.5로 제한한다',()=>{expect(renderPixelRatio(3,561)).toBe(1.5);});
it('기기 DPR1이면 데스크톱에서도 렌더 DPR1을 유지한다',()=>{expect(renderPixelRatio(1,1440)).toBe(1);});
it('유효하지 않은 기기 DPR이면 렌더 DPR1을 사용한다',()=>{expect(renderPixelRatio(NaN,390)).toBe(1);});
