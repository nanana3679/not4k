export function withPublicBase(pathname: string, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedPathname = `/${pathname.replace(/^\/+/, "")}`;
  const normalizedBase = `/${baseUrl.replace(/^\/+|\/+$/g, "")}`;

  return normalizedBase === "/" ? normalizedPathname : `${normalizedBase}${normalizedPathname}`;
}
