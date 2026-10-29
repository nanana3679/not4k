/**
 * Supabase 클라이언트 싱글턴
 *
 * 환경 변수:
 *   VITE_SUPABASE_URL      — Supabase 프로젝트 URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY — 퍼블릭 키
 *
 * 클라이언트 생성과 환경 변수 검사는 import 시점이 아니라 `supabase`의 속성을 처음 읽을 때 한다.
 * 그래서 이 모듈을 import만 하고 쓰지 않는 코드(supabase와 무관한 단위 테스트 등)는 환경 변수 없이도 로드된다.
 * 단위 테스트에서는 Vitest 전역 setup(`blockClientInUnitTests.ts`)이 이 모듈을 쓰면 던지는 객체로 바꾼다(#373).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경 변수가 설정되지 않았습니다.",
    );
  }

  client = createClient(supabaseUrl, supabaseKey);
  return client;
}

// 속성 읽기를 실제 클라이언트로 넘긴다. 메서드는 실제 클라이언트에 bind해서,
// `supabase.from(...)`처럼 부르든 구조 분해로 꺼내 부르든 `this`가 실제 클라이언트를 가리키게 한다.
// 넘기는 것은 속성 읽기뿐이다. `in`, `Object.keys`, 대입, `vi.spyOn(supabase, ...)`은 빈 대상에 닿으므로
// 테스트에서 바꿔 끼울 때는 `vi.mock("./client", ...)`처럼 모듈을 대체한다.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const real = getClient();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
