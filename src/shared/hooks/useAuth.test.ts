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

  it("localhost:3000의 editor URL에서 로그인하면 같은 차트 편집 화면으로 돌아옴", () => {
    const redirectTo = getGoogleRedirectTo({
      origin: "http://localhost:3000",
      pathname: "/editor",
      search: "?songId=s1&difficulty=easy",
      hash: "",
    });

    expect(redirectTo).toBe(
      "http://localhost:3000/editor?songId=s1&difficulty=easy",
    );
  });
});
