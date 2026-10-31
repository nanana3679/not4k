import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeProfileReturn, parseProfileRedirect, readProfileReturnStartedAt, signInFromProfile } from './profileAuth';

function mockSessionStorage() {
  const valueByKey = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => valueByKey.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { valueByKey.set(key, value); }),
    removeItem: vi.fn((key: string) => { valueByKey.delete(key); }),
  };
  vi.stubGlobal('window', { sessionStorage: storage });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('프로필 로그인 복귀 의도', () => {
  it.each([0, 10])('Login 후 %i분에 복귀 의도를 읽으면 true이고 다음 읽기는 false다', async (minutes) => {
    vi.useFakeTimers();
    mockSessionStorage();
    await signInFromProfile(async () => {});
    vi.advanceTimersByTime(minutes * 60 * 1000);
    expect(consumeProfileReturn()).toBe(true);
    expect(consumeProfileReturn()).toBe(false);
  });

  it.each(['broken', '{}', 'NaN', '', '1'])('마커가 %j이면 복귀 의도를 무시하고 저장소에서 지운다', (value) => {
    const storage = mockSessionStorage();
    storage.setItem('not4k-profile-return', value);
    expect(consumeProfileReturn()).toBe(false);
    expect(storage.getItem('not4k-profile-return')).toBeNull();
  });

  it('Login 후 11분이 지나 복귀 의도를 읽으면 false이고 저장된 마커를 지운다', async () => {
    vi.useFakeTimers();
    const storage = mockSessionStorage();
    await signInFromProfile(async () => {});
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeProfileReturn()).toBe(false);
    expect(storage.getItem('not4k-profile-return')).toBeNull();
  });

  it('기기 시계를 되돌려 마커 시작 시각이 현재보다 1분 뒤이면 readProfileReturnStartedAt은 null이고 마커를 지운다', () => {
    const storage = mockSessionStorage();
    storage.setItem('not4k-profile-return', String(Date.now() + 60 * 1000));
    expect(readProfileReturnStartedAt()).toBeNull();
    expect(storage.getItem('not4k-profile-return')).toBeNull();
  });

  it('Login을 누르면 Google 이동 전에 복귀 의도를 저장하고 두 번 읽어도 한 번만 소비한다', async () => {
    mockSessionStorage();
    const redirect = vi.fn(async () => {
      expect(consumeProfileReturn()).toBe(true);
      expect(consumeProfileReturn()).toBe(false);
    });

    expect(await signInFromProfile(redirect)).toBeNull();
    expect(redirect).toHaveBeenCalledOnce();
  });

  it('Google 이동 전에 Network unavailable 오류가 나면 메시지를 반환하고 복귀 의도를 지워 같은 버튼으로 재시도한다', async () => {
    mockSessionStorage();
    const signIn = vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(undefined);
    expect(await signInFromProfile(signIn)).toBe('Network unavailable');
    expect(consumeProfileReturn()).toBe(false);
    expect(await signInFromProfile(signIn)).toBeNull();
    expect(consumeProfileReturn()).toBe(true);
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)('sessionStorage.%s가 Storage blocked를 던져도 Login은 1회 실행되고 consumeProfileReturn은 예외 없이 false를 반환해 자동 복귀하지 않는다', async (method) => {
    const storage = mockSessionStorage();
    storage[method].mockImplementation(() => { throw new Error('Storage blocked'); });
    const signIn = vi.fn().mockResolvedValue(undefined);
    expect(await signInFromProfile(signIn)).toBeNull();
    expect(signIn).toHaveBeenCalledOnce();
    expect(consumeProfileReturn()).toBe(false);
  });

  it('sessionStorage 속성 접근 자체가 SecurityError를 던져도 로그인은 실행하고 복귀 의도는 false다', async () => {
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('SecurityError'); } });
    expect(await signInFromProfile(async () => {})).toBeNull();
    expect(consumeProfileReturn()).toBe(false);
  });
});

describe('Google 복귀 URL', () => {
  it('access_denied에 signup_disabled가 있으면 취소 대신 Signups disabled 오류를 표시한다', () => {
    expect(parseProfileRedirect('https://example.test/game#error=access_denied&error_code=signup_disabled&error_description=Signups+disabled').outcome)
      .toEqual({ status: 'failure', message: 'Signups disabled' });
  });

  it.each(['', '&error_code=access_denied'])('access_denied%s로 복귀하면 설명 없이 cancel을 반환한다', (code) => {
    expect(parseProfileRedirect(`https://example.test/game?error=access_denied${code}`).outcome)
      .toEqual({ status: 'cancel' });
  });

  it.each(['?', '#'])('%serror=access_denied로 복귀하면 오류 메시지 없이 cancel이며 다른 URL 값은 보존한다', (separator) => {
    expect(parseProfileRedirect(`https://example.test/game${separator}error=access_denied&error_description=User+cancelled&keep=1`)).toEqual({
      outcome: { status: 'cancel' },
      cleanUrl: `https://example.test/game${separator}keep=1`,
    });
  });

  it.each(['?', '#'])('%serror=server_error·설명 Provider unavailable이면 failure와 설명을 반환한다', (separator) => {
    expect(parseProfileRedirect(`https://example.test/game${separator}error=server_error&error_code=500&error_description=Provider+unavailable`)).toEqual({
      outcome: { status: 'failure', message: 'Provider unavailable' },
      cleanUrl: 'https://example.test/game',
    });
  });

  it('오류 없는 code=abc·#profile URL이면 결과는 null이고 URL을 그대로 둔다', () => {
    const href = 'https://example.test/game?code=abc#profile';
    expect(parseProfileRedirect(href)).toEqual({ outcome: null, cleanUrl: href });
  });

  it.each([
    ['?error_code=provider_disabled', 'provider_disabled'],
    ['#error_description=Try+again', 'Try again'],
    ['?error=server_error', 'server_error'],
  ])('%s만 있어도 failure 메시지 %s를 반환한다', (params, message) => {
    expect(parseProfileRedirect(`https://example.test/game${params}`).outcome).toEqual({ status: 'failure', message });
  });

  it('query의 server_error가 hash의 access_denied보다 우선하며 양쪽 오류와 access_token을 지우고 code=abc는 보존한다', () => {
    expect(parseProfileRedirect('https://example.test/game?error=server_error&error_description=Query+failure&code=abc#access_token=token&error=access_denied&error_code=denied')).toEqual({
      outcome: { status: 'failure', message: 'Query failure' },
      cleanUrl: 'https://example.test/game?code=abc',
    });
  });

  it('SDK 초기화 실패로 #access_token·refresh_token·expires_in·token_type이 남은 ?keep=1 URL이면 결과는 null이고 cleanUrl은 토큰 hash를 지우고 keep=1을 남긴다', () => {
    expect(parseProfileRedirect('https://example.test/game?keep=1#access_token=token&refresh_token=refresh&expires_in=3600&token_type=bearer')).toEqual({
      outcome: null,
      cleanUrl: 'https://example.test/game?keep=1',
    });
  });
});
