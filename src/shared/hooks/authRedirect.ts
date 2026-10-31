export interface AuthRedirectLocation {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
}

/**
 * OAuth 복귀 URL에 붙는 결과 키(auth-js 2.95.3 `_getSessionFromURL`이 query·hash에서 읽는 값).
 * 다음 Login의 redirectTo에 남으면 새 복귀 때 auth-js가 이전 오류·토큰을 다시 읽는다.
 */
const OAUTH_RESULT_PARAMS = [
  'error', 'error_code', 'error_description',
  'access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type',
  'provider_token', 'provider_refresh_token', 'type',
];

/**
 * `?…` 또는 `#…` 문자열에서 OAuth 결과 키만 지운다. 결과 키가 없으면 원문을 그대로 돌려줘
 * `#profile` 같은 hash와 다른 query 값의 표기를 바꾸지 않는다. 남는 값이 없으면 빈 문자열이다.
 */
export function withoutOAuthResultParams(searchOrHash: string): string {
  const params = new URLSearchParams(searchOrHash.slice(1));
  if (!OAUTH_RESULT_PARAMS.some(key => params.has(key))) return searchOrHash;
  for (const key of OAUTH_RESULT_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `${searchOrHash[0]}${rest}` : '';
}

export function getAuthRedirectTo(
  location: AuthRedirectLocation,
  configuredOrigin?: string,
): string {
  const origin = (configuredOrigin?.trim() || location.origin).replace(/\/+$/, "");
  const search = withoutOAuthResultParams(location.search);
  const hash = withoutOAuthResultParams(location.hash);
  return `${origin}${location.pathname}${search}${hash}`;
}
