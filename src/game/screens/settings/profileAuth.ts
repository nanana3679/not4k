const PROFILE_RETURN_KEY = 'not4k-profile-return';
const PROFILE_RETURN_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_ERROR_PARAMS = ['error', 'error_code', 'error_description'];

type ProfileRedirectOutcome = { status: 'cancel' } | { status: 'failure'; message: string };

/** 성공 여부는 URL이 아니라 useAuth의 세션으로 판단한다. null은 URL 오류가 없다는 뜻이다. */
export function parseProfileRedirect(href: string): {
  outcome: ProfileRedirectOutcome | null;
  cleanUrl: string;
} {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const hashHasError = OAUTH_ERROR_PARAMS.some(key => hash.has(key));
  // auth-js의 parseParametersFromURL과 동일하게 query가 hash보다 우선한다.
  const value = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  // 실제 Google 취소 URL은 E2E 미검증이다. 별도 실패 코드가 없는 access_denied만 취소로 가정한다.
  const cancelled = value('error') === 'access_denied'
    && (!value('error_code') || value('error_code') === 'access_denied');
  const outcome: ProfileRedirectOutcome | null = cancelled
    ? { status: 'cancel' }
    : OAUTH_ERROR_PARAMS.some(key => value(key))
      ? { status: 'failure', message: value('error_description') || value('error_code') || value('error')! }
      : null;
  for (const params of [url.searchParams, hash]) {
    for (const key of OAUTH_ERROR_PARAMS) params.delete(key);
  }
  if (hashHasError) url.hash = hash.toString();
  return { outcome, cleanUrl: url.href };
}

/** 읽기만 할 때는 유효한 마커를 유지한다. 만료·잘못된 값은 즉시 지운다. */
export function readProfileReturnStartedAt(): number | null {
  try {
    const value = window.sessionStorage.getItem(PROFILE_RETURN_KEY);
    const startedAt = Number(value);
    const age = Date.now() - startedAt;
    const pending = value !== null && /^\d+$/.test(value) && Number.isSafeInteger(startedAt)
      && age >= 0 && age <= PROFILE_RETURN_MAX_AGE_MS;
    if (pending) return startedAt;
    window.sessionStorage.removeItem(PROFILE_RETURN_KEY);
    return null;
  } catch {
    return null;
  }
}

export function consumeProfileReturn(): boolean {
  try {
    const pending = readProfileReturnStartedAt() !== null;
    window.sessionStorage.removeItem(PROFILE_RETURN_KEY);
    return pending;
  } catch {
    return false;
  }
}

export async function signInFromProfile(signIn: () => Promise<void>): Promise<string | null> {
  try {
    window.sessionStorage.setItem(PROFILE_RETURN_KEY, String(Date.now()));
  } catch {
    // 저장을 막은 브라우저에서도 기존 Google 로그인은 사용할 수 있다.
  }
  try {
    await signIn();
    return null;
  } catch (error) {
    consumeProfileReturn();
    return error instanceof Error ? error.message : 'Unable to log in. Please try again.';
  }
}

export async function signOutFromProfile(
  signOut: () => Promise<{ error: Error | null } | void>,
  onSignedOut: () => void,
): Promise<string | null> {
  try {
    const result = await signOut();
    if (result?.error) throw result.error;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to log out. Please try again.';
  }
  onSignedOut();
  return null;
}
