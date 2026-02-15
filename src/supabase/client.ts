/**
 * Supabase 클라이언트 싱글턴
 *
 * 환경 변수:
 *   VITE_SUPABASE_URL      — Supabase 프로젝트 URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY — 퍼블릭 키
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경 변수가 설정되지 않았습니다.",
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseKey,
);
