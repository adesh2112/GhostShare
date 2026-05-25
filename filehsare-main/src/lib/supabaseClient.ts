import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/config/env";

const { supabaseUrl, supabaseAnonKey } = getClientEnv();

// Build-safe initialization: do not crash if variables are not yet defined during next build
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
