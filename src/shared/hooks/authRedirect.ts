export interface AuthRedirectLocation {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
}

export function getAuthRedirectTo(
  location: AuthRedirectLocation,
  configuredOrigin?: string,
): string {
  const origin = (configuredOrigin?.trim() || location.origin).replace(/\/+$/, "");
  return `${origin}${location.pathname}${location.search}${location.hash}`;
}
