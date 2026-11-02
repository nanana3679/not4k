import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMediaPlaybackLeadMs, mediaPlaybackLeadMs } from './mediaPlaybackLead';

const chromium = { userAgent: 'HeadlessChrome/145.0.7632.6' };

afterEach(() => { vi.unstubAllGlobals(); });

describe('mediaPlaybackLeadMs', () => {
  it.each([
    [0.25, 39.7], [0.3, 39.5], [0.4, 35.2], [0.5, 31.4], [0.6, 30.1],
    [0.7, 25.6], [0.75, 18.5], [0.8, 27.4], [0.9, 12.5], [0.95, 11.6], [1, 0],
  ])('Chromium %s배속은 실측 평균 %sms를 반환한다', (rate, expected) => {
    expect(mediaPlaybackLeadMs(rate, chromium)).toBeCloseTo(expected, 10);
  });

  it.each([
    [0.625, 28.975], [0.775, 22.95], [0.975, 5.8],
  ])('Chromium %s배속은 인접 실측값 사이를 선형 보간해 %sms를 반환한다', (rate, expected) => {
    expect(mediaPlaybackLeadMs(rate, chromium)).toBeCloseTo(expected, 10);
  });

  it.each([1, 1.5, 4])('Chromium %s배속은 1배속 이상이므로 0ms를 반환한다', rate => {
    expect(mediaPlaybackLeadMs(rate, chromium)).toBe(0);
  });

  it.each([0.1, 0.2])('Chromium %s배속은 측정 하한 0.25배속의 39.7ms로 고정한다', rate => {
    expect(mediaPlaybackLeadMs(rate, chromium)).toBe(39.7);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('유효하지 않은 배속 %s는 0ms를 반환한다', rate => {
    expect(mediaPlaybackLeadMs(rate, chromium)).toBe(0);
  });

  it.each([
    'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36',
    'Mozilla/5.0 Chromium/145.0.7632.6',
    'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
  ])('Chromium 계열 UA=%s에서 0.5배속은 31.4ms를 반환한다', userAgent => {
    expect(mediaPlaybackLeadMs(0.5, { userAgent })).toBeCloseTo(31.4);
  });

  it.each([
    'Mozilla/5.0 Gecko/20100101 Firefox/145.0',
    'Mozilla/5.0 Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/145.0.0.0 Mobile/15E148 Safari/604.1',
    '',
  ])('미측정 UA=%s에서 0.5배속은 0ms를 반환한다', userAgent => {
    expect(mediaPlaybackLeadMs(0.5, { userAgent })).toBe(0);
  });

  it('UA 없이 brands에 Chromium이 있으면 0.5배속은 31.4ms를 반환한다', () => {
    expect(mediaPlaybackLeadMs(0.5, {
      brands: [{ brand: 'Not A Brand' }, { brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
    })).toBeCloseTo(31.4);
  });

  it('brands가 비어 있어도 Chrome UA가 있으면 0.5배속은 31.4ms를 반환한다', () => {
    expect(mediaPlaybackLeadMs(0.5, { ...chromium, brands: [] })).toBeCloseTo(31.4);
  });

  it('brands에 Not A Brand만 있고 UA도 없으면 0.5배속은 0ms를 반환한다', () => {
    expect(mediaPlaybackLeadMs(0.5, { brands: [{ brand: 'Not A Brand' }] })).toBe(0);
  });

  it('실제 navigator가 Chromium이어도 주입한 Firefox UA의 0.5배속 보정은 0ms다', () => {
    vi.stubGlobal('navigator', chromium);
    expect(mediaPlaybackLeadMs(0.5, { userAgent: 'Firefox/145.0' })).toBe(0);
  });
});

describe('getMediaPlaybackLeadMs', () => {
  it('navigator.userAgent가 HeadlessChrome이면 0.5배속은 31.4ms를 반환한다', () => {
    vi.stubGlobal('navigator', chromium);
    expect(getMediaPlaybackLeadMs(0.5)).toBeCloseTo(31.4);
  });

  it('navigator.userAgentData.brands에 Chromium이 있으면 0.25배속은 39.7ms를 반환한다', () => {
    vi.stubGlobal('navigator', {
      userAgent: '', userAgentData: { brands: [{ brand: 'Chromium', version: '145' }] },
    });
    expect(getMediaPlaybackLeadMs(0.25)).toBe(39.7);
  });

  it('navigator가 없는 환경에서 0.5배속은 0ms를 반환한다', () => {
    vi.stubGlobal('navigator', undefined);
    expect(getMediaPlaybackLeadMs(0.5)).toBe(0);
  });
});
