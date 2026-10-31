const PROFILE_RETURN_KEY = 'not4k-profile-return';
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
  const outcome: ProfileRedirectOutcome | null = value('error') === 'access_denied'
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

export function consumeProfileReturn(): boolean {
  try {
    const pending = window.sessionStorage.getItem(PROFILE_RETURN_KEY) === '1';
    window.sessionStorage.removeItem(PROFILE_RETURN_KEY);
    return pending;
  } catch {
    return false;
  }
}

export async function signInFromProfile(signIn: () => Promise<void>): Promise<string | null> {
  try {
    window.sessionStorage.setItem(PROFILE_RETURN_KEY, '1');
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
