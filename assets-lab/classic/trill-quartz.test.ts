import { describe, expect, it } from 'vitest';
import { trillAssemblyLayout, buildTrillQuartzAssets, trillBodySvg, trillTerminalSvg } from './trill-quartz.mjs';

describe('석영 바디·끝 터미널 상태', () => {
  it('켜짐 바디와 끝 터미널은 같은 흰빛을 포함하고 대기·실패에는 발광 레이어가 없음', () => {
    for (const make of [trillBodySvg,trillTerminalSvg]) {
      expect(make('on')).toContain('data-layer="emission" data-light="white"');
      expect(make('idle')).not.toContain('data-layer="emission"');
      expect(make('failed')).not.toContain('data-layer="emission"');
    }
    expect(Object.keys(buildTrillQuartzAssets())).toEqual([
      'point-trill','body-trill','terminal-end-trill','body-trill-on','terminal-end-trill-on','body-trill-failed','terminal-end-trill-failed',
    ]);
  });
});

describe('석영 도안 조립 치수', () => {
  it('너비100·바디 길이120이면 두 마름모 중심 사이에 바디120을 놓고 전체 높이는140', () => {
    expect(trillAssemblyLayout(100, 120)).toEqual({width:100, capHeight:20, bodyTop:10, bodyHeight:120, pointTop:120, height:140});
  });

  it('너비125·바디 길이83.5에서도 캡 높이25를 유지하고 마지막 반 픽셀까지 길이를 보존', () => {
    expect(trillAssemblyLayout(125, 83.5)).toEqual({width:125, capHeight:25, bodyTop:12.5, bodyHeight:83.5, pointTop:83.5, height:108.5});
  });

  it('바디 길이0이면 두 마름모가 같은 위치에 겹치고 추가 바디나 최소 간격을 만들지 않음', () => {
    expect(trillAssemblyLayout(100, 0)).toEqual({width:100, capHeight:20, bodyTop:10, bodyHeight:0, pointTop:0, height:20});
  });
});
