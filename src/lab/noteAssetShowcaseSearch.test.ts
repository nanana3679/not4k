import { describe, expect, it } from 'vitest';
import { nextShowcaseSearch } from './noteAssetShowcaseSearch';

const search = (query: string) => new URLSearchParams(query);

describe('시연실 시안·버전 선택의 주소 갱신 (#176)', () => {
  it('design=simple에서 Simple을 다시 고르면 주소는 design=simple 그대로이고 replace=true로 방문 기록을 늘리지 않는다', () => {
    const { params, replace } = nextShowcaseSearch(search('design=simple'), { design: 'simple' });
    expect(params.toString()).toBe('design=simple');
    expect(replace).toBe(true);
  });

  it('파라미터 없는 첫 방문에서 기본 시안 classic을 고르면 design=classic을 붙이되 화면이 같아 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search(''), { design: 'classic' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(true);
  });

  it('design=classic에서 Simple을 고르면 design=simple로 바꾸고 replace=false로 방문 기록을 쌓는다', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic'), { design: 'simple' });
    expect(params.toString()).toBe('design=simple');
    expect(replace).toBe(false);
  });

  it('design=classic&version=v012에서 Classic을 고르면 version을 지워 현재 적용본으로 바꾸고 replace=false', () => {
    const current = search('design=classic&version=v012');
    const { params, replace } = nextShowcaseSearch(current, { design: 'classic' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(false);
    expect(current.toString()).toBe('design=classic&version=v012');
  });

  it('design=classic(현재 적용본)에서 v012를 고르면 version=v012를 붙이고 replace=false', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic'), { version: 'v012' });
    expect(params.toString()).toBe('design=classic&version=v012');
    expect(replace).toBe(false);
  });

  it('version=v012에서 v013을 고르면 version=v013으로 바꾸고 replace=false', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic&version=v012'), { version: 'v013' });
    expect(params.toString()).toBe('design=classic&version=v013');
    expect(replace).toBe(false);
  });

  it('version=v012에서 v012를 다시 고르면 주소는 그대로이고 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic&version=v012'), { version: 'v012' });
    expect(params.toString()).toBe('design=classic&version=v012');
    expect(replace).toBe(true);
  });

  it('design=classic(현재 적용본)에서 current를 고르면 version 없이 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic'), { version: 'current' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(true);
  });

  it('현재 적용본으로 표시되는 잘못된 version=v999에서 current를 고르면 version을 지우고 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search('design=classic&version=v999'), { version: 'current' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(true);
  });

  it('기본 시안 Classic으로 표시되는 잘못된 design=foo에서 Classic을 고르면 design=classic으로 정규화하고 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search('design=foo'), { design: 'classic' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(true);
  });

  it('version이 무시되는 design=simple&version=v012에서 Simple을 고르면 version을 지운 design=simple이 되고 replace=true', () => {
    const { params, replace } = nextShowcaseSearch(search('design=simple&version=v012'), { design: 'simple' });
    expect(params.toString()).toBe('design=simple');
    expect(replace).toBe(true);
  });

  it('Classic v012로 표시되는 design=foo&version=v012에서 Classic을 고르면 현재 적용본으로 바뀌어 replace=false', () => {
    const { params, replace } = nextShowcaseSearch(search('design=foo&version=v012'), { design: 'classic' });
    expect(params.toString()).toBe('design=classic');
    expect(replace).toBe(false);
  });

  it('관계없는 foo=bar 인자는 design=classic에서 Simple로 바꿔도 그대로 남는다', () => {
    const { params } = nextShowcaseSearch(search('foo=bar&design=classic'), { design: 'simple' });
    expect(params.toString()).toBe('foo=bar&design=simple');
  });
});
