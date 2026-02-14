import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  const message = "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다.";
  if (import.meta.env.DEV) {
    throw new Error(message);
  }
  console.warn(message);
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
);
