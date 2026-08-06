// ============================================================
// SCHOOLBOT - SUPABASE CLIENT
// supabase/functions/_shared/supabase.ts
// ============================================================

import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ─── Single instance (reused across requests) ──────────────────────────────
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  // Return existing client if already created
  if (_client) return _client;

  // Get credentials from environment
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Crash early if credentials are missing
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  // Create client with service role key
  // This bypasses Row Level Security (RLS)
  // Safe to use on server side only
  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
