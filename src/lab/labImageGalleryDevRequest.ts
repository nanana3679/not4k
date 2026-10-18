type LabImageGalleryDevRequestResult =
  | { kind: "pass" }
  | { kind: "reject" }
  | { kind: "rewrite"; url: string };

export function mapLabImageGalleryDevRequest(
  requestUrl: string,
  galleryIds: ReadonlySet<string>,
): LabImageGalleryDevRequestResult {
  const [pathname, query] = requestUrl.split("?", 2);
  const match = pathname.match(/^\/lab\/images\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/.*)?$/);
  const galleryId = match?.[1];
  if (!galleryId || !galleryIds.has(galleryId)) return { kind: "pass" };

  const requestedPath = match[2] ?? "/";
  try {
    const hasTraversal = requestedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"));
    if (hasTraversal) return { kind: "reject" };
  } catch {
    return { kind: "reject" };
  }

  const relativePath = requestedPath === "/" ? "/index.html" : requestedPath;
  return {
    kind: "rewrite",
    url: `/lab/image-galleries/${galleryId}${relativePath}${query ? `?${query}` : ""}`,
  };
}
