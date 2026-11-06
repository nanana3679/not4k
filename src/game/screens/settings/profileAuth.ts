import { withoutOAuthResultParams } from '../../../shared/hooks/authRedirect';

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
  // 오류뿐 아니라 처리에 실패한 토큰도 지운다. 주소창에 남으면 다음 Login의 redirectTo에 섞인다.
  url.search = withoutOAuthResultParams(url.search);
  url.hash = withoutOAuthResultParams(url.hash);
  return { outcome, cleanUrl: url.href };
}

/** 읽기만 할 때는 유효한 마커를 유지한다. 만료·잘못된 값은 즉시 지운다. */
export function readProfileReturnStartedAt(): number | null {
  try {
    const value = window.sessionStorage.getItem(PROFILE_RETURN_KEY);
    const startedAt = Number(value);
    const age = Date.now() - startedAt;
    // age < 0은 Login 뒤 기기 시계가 뒤로 바뀐 경우다. 유효 시간을 잴 수 없으므로 버린다.
    const valid = value !== null && /^\d+$/.test(value) && Number.isSafeInteger(startedAt)
      && age >= 0 && age <= PROFILE_RETURN_MAX_AGE_MS;
    if (valid) return startedAt;
    window.sessionStorage.removeItem(PROFILE_RETURN_KEY);
    return null;
  } catch {
    return null;
  }
}

export function consumeProfileReturn(): boolean {
  try {
    const hasReturnIntent = readProfileReturnStartedAt() !== null;
    window.sessionStorage.removeItem(PROFILE_RETURN_KEY);
    return hasReturnIntent;
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
    // Google에서 Back으로 돌아오면(bfcache·새로고침) 복귀 처리가 이 주소를 새 마커의 결과로 읽는다.
    // 헤더 Login 등이 남긴 이전 OAuth 결과를 떠나기 전에 현재 history 항목에서 지운다.
    const { cleanUrl } = parseProfileRedirect(window.location.href);
    if (cleanUrl !== window.location.href) window.history.replaceState(window.history.state, '', cleanUrl);
  } catch {
    // replaceState가 막혀도(Safari의 호출 횟수 제한 등) Google 로그인은 진행한다.
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
