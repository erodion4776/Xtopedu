// dashboard/lib/supabase.ts
// ✅ Single file — removes the duplicate

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Client-side (anon key) ─────────────────────────────
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

// ── Server-side (service role key — bypasses RLS) ──────
export const createServerClient = () =>
  createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    }
  );
