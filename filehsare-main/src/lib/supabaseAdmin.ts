import { createClient } from "@supabase/supabase-js";
import { validateEnv } from "@/config/env";

export const getSupabaseAdmin = () => {
  const env = validateEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
