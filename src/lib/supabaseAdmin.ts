import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server only — every write in this app goes through a
 * route handler so the rate limiting and Elo math can't be bypassed by
 * talking to Postgres directly from a phone.
 */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in your project URL and keys."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
