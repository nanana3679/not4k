import { describe, expect, it } from "vitest";
import { getGoogleRedirectTo } from "./useAuth";

describe("getGoogleRedirectTo", () => {
  it("keeps the current route so OAuth codes survive the SPA router", () => {
    const redirectTo = getGoogleRedirectTo({
      origin: "https://not4k.vercel.app",
      pathname: "/game",
      search: "",
      hash: "",
    });

    expect(redirectTo).toBe("https://not4k.vercel.app/game");
  });

  it("preserves editor query parameters across the OAuth round trip", () => {
    const redirectTo = getGoogleRedirectTo({
      origin: "https://not4k.vercel.app",
      pathname: "/editor",
      search: "?songId=s1&difficulty=EXPERT",
      hash: "",
    });

    expect(redirectTo).toBe(
      "https://not4k.vercel.app/editor?songId=s1&difficulty=EXPERT",
    );
  });
});
