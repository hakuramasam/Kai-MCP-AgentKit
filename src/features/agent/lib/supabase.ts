import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Server-side Supabase client with service role key.
 * Only use in server actions / API routes — never expose to client.
 */
export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Check if Supabase is configured (non-throwing)
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}
