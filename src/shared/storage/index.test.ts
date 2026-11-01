import { describe, it, expect } from 'vitest';
import { newChartAssetPaths, resolveChartAssetPaths, withCacheBust } from './index';

describe('withCacheBust', () => {
  const base = 'https://cdn.example.com/assets/songs/s1/preview.wav';

  it('token이 있으면 쿼리 없는 URL에 ?v=token을 붙인다', () => {
    expect(withCacheBust(base, '2026-06-26T00:00:00Z')).toBe(
      `${base}?v=${encodeURIComponent('2026-06-26T00:00:00Z')}`,
    );
  });

  it('이미 쿼리가 있는 URL이면 &v=token으로 이어붙인다', () => {
    expect(withCacheBust(`${base}?foo=1`, 'abc')).toBe(`${base}?foo=1&v=abc`);
  });

  it('token이 null이면 URL을 그대로 반환(캐시버스트 안 함)', () => {
    expect(withCacheBust(base, null)).toBe(base);
  });

  it('token이 undefined이면 URL을 그대로 반환', () => {
    expect(withCacheBust(base, undefined)).toBe(base);
  });

  it('token이 빈 문자열이면 URL을 그대로 반환', () => {
    expect(withCacheBust(base, '')).toBe(base);
  });

  it('token의 특수문자(콜론 등)는 URL 인코딩한다', () => {
    expect(withCacheBust(base, 'a b:c')).toBe(`${base}?v=a%20b%3Ac`);
  });
});

describe('resolveChartAssetPaths', () => {
  it('charts 행이 없으면 Song-1·EASY의 기존 결정적 경로 songs/song-1/easy.json·easy.extra.json을 쓴다', () => {
    expect(resolveChartAssetPaths('Song-1', 'EASY', null)).toEqual({
      chartPath: 'songs/song-1/easy.json', extraPath: 'songs/song-1/easy.extra.json',
    });
  });

  it('chart_path·chart_extra_path가 NULL인 행은 기존 결정적 경로를 쓴다', () => {
    expect(resolveChartAssetPaths('song-1', 'normal', { chartPath: null, chartExtraPath: null })).toEqual({
      chartPath: 'songs/song-1/normal.json', extraPath: 'songs/song-1/normal.extra.json',
    });
  });

  it('행에 저장된 경로가 있으면 결정적 경로 대신 그 경로를 그대로 쓴다', () => {
    expect(resolveChartAssetPaths('song-1', 'normal', {
      chartPath: 'songs/song-1/normal-a.json', chartExtraPath: 'songs/song-1/normal-a.extra.json',
    })).toEqual({ chartPath: 'songs/song-1/normal-a.json', extraPath: 'songs/song-1/normal-a.extra.json' });
  });
});

describe('newChartAssetPaths', () => {
  it('Song-1·HARD·토큰 abc-1이면 songs/song-1/hard-abc-1.json과 같은 토큰의 .extra.json을 만든다', () => {
    expect(newChartAssetPaths('Song-1', 'HARD', 'abc-1')).toEqual({
      chartPath: 'songs/song-1/hard-abc-1.json', extraPath: 'songs/song-1/hard-abc-1.extra.json',
    });
  });

  it('토큰이 다르면 같은 곡·난이도라도 기존 결정적 경로와 다른 경로가 된다', () => {
    const first = newChartAssetPaths('song-1', 'normal', 'token-1');
    const second = newChartAssetPaths('song-1', 'normal', 'token-2');
    expect(first.chartPath).not.toBe(second.chartPath);
    expect(first.chartPath).not.toBe('songs/song-1/normal.json');
  });

  it('경로 문자로 쓸 수 없는 토큰 a/b는 거부한다', () => {
    expect(() => newChartAssetPaths('song-1', 'normal', 'a/b')).toThrow('유효하지 않은 token');
  });
});
