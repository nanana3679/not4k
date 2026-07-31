import { describe, it, expect } from 'vitest';
import {
  songChartExtraRevisionPath,
  songChartRevisionPath,
  withCacheBust,
} from './index';

describe('차트 세대 경로', () => {
  it('song-one HARD rev-123이면 메인·보조 세대 경로를 소문자로 생성', () => {
    expect(songChartRevisionPath('song-one', 'HARD', 'rev-123')).toBe(
      'songs/song-one/hard.rev-123.json',
    );
    expect(songChartExtraRevisionPath('song-one', 'HARD', 'rev-123')).toBe(
      'songs/song-one/hard.rev-123.extra.json',
    );
  });

  it('revision="../escape"이면 경로 탈출을 허용하지 않고 에러', () => {
    expect(() => songChartRevisionPath('song-one', 'HARD', '../escape'))
      .toThrow('유효하지 않은 revision');
  });
});

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
