import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getGoogleRedirectTo, type useAuth } from "./useAuth";

// supabase mock — useAuth를 다시 import할 때마다 실제 supabase client를 만들지 않게 한다
const authMock = vi.hoisted(() => ({ signOut: vi.fn(), signInWithOAuth: vi.fn() }));
vi.mock("../../supabase/client", () => ({ supabase: { auth: authMock } }));

type AuthState = ReturnType<typeof useAuth>;

// DEV_ADMIN은 모듈을 읽을 때 한 번 정해지므로 env를 바꾼 뒤 다시 import한 useAuth를 넣는다.
let useAuthUnderTest: typeof useAuth;

function AuthProbe({ onRender }: { onRender: (state: AuthState) => void }) {
  onRender(useAuthUnderTest());
  return null;
}

// 서버 렌더는 effect를 실행하지 않으므로 useAuth의 첫 렌더 상태만 잡힌다.
async function renderFirstAuthState(): Promise<AuthState | undefined> {
  vi.resetModules();
  useAuthUnderTest = (await import("./useAuth")).useAuth;
  let state: AuthState | undefined;
  renderToStaticMarkup(createElement(AuthProbe, { onRender: (s) => { state = s; } }));
  return state;
}

describe("useAuth 첫 렌더 상태", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("개발 환경에서 VITE_DEV_ADMIN=true면 useAuth가 첫 렌더부터 dev@local 사용자·isAdmin true·loading false로 시작함", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEV_ADMIN", "true");

    const state = await renderFirstAuthState();

    expect(state).toMatchObject({
      user: { id: "dev-user", email: "dev@local" },
      isAdmin: true,
      loading: false,
    });
  });

  it("배포 빌드(import.meta.env.DEV=false)에서는 VITE_DEV_ADMIN=true여도 useAuth가 user null·isAdmin false·loading true로 시작함", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEV_ADMIN", "true");

    const state = await renderFirstAuthState();

    expect(state).toMatchObject({ user: null, isAdmin: false, loading: true });
  });

  it("개발 환경에서 VITE_DEV_ADMIN=false면 useAuth가 user null·isAdmin false·loading true로 시작함", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEV_ADMIN", "false");

    const state = await renderFirstAuthState();

    expect(state).toMatchObject({ user: null, isAdmin: false, loading: true });
  });
});

// GameApp이 닉네임 연동을 Profile 마운트에 맡길지 고를 때 읽는 값이다. 모듈을 읽을 때 한 번 정해지므로 env를 바꾼 뒤 다시 import한다.
describe("DEV_ADMIN export", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["개발 환경(DEV=true)에서 VITE_DEV_ADMIN=true", true, true, "true"],
    ["배포 빌드(DEV=false)에서 VITE_DEV_ADMIN=true", false, false, "true"],
    ["개발 환경(DEV=true)에서 VITE_DEV_ADMIN=false", false, true, "false"],
  ] as const)("%s면 DEV_ADMIN export가 %s", async (_env, expected, DEV, VITE_DEV_ADMIN) => {
    vi.stubEnv("DEV", DEV);
    vi.stubEnv("VITE_DEV_ADMIN", VITE_DEV_ADMIN);
    vi.resetModules();

    expect((await import("./useAuth")).DEV_ADMIN).toBe(expected);
  });
});

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

describe('useAuth 작업 오류', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('Supabase signOut이 Logout unavailable 오류를 반환하면 useAuth.signOut은 reject하지 않고 { error }를 그대로 resolve한다', async () => {
    const error = new Error('Logout unavailable');
    authMock.signOut.mockResolvedValue({ error });
    const state = await renderFirstAuthState();
    await expect(state!.signOut()).resolves.toEqual({ error });
  });

  it.each(['return', 'throw'])('Supabase signInWithOAuth가 %s 방식으로 Login unavailable을 알리면 호출자에게 오류를 던진다', async (mode) => {
    vi.stubGlobal('window', { location: { origin: 'https://example.test', pathname: '/game', search: '', hash: '' } });
    const error = new Error('Login unavailable');
    if (mode === 'return') authMock.signInWithOAuth.mockResolvedValue({ error });
    else authMock.signInWithOAuth.mockRejectedValue(error);
    const state = await renderFirstAuthState();
    await expect(state!.signInWithGoogle()).rejects.toThrow('Login unavailable');
    expect(authMock.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://example.test/game' } });
  });
});
