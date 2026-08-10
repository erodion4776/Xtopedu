// ============================================================
// SCHOOLBOT - MARKETING SESSION SERVICE
// _shared/bot/marketing/marketing.session.ts
//
// Stores demo sessions in Supabase DB instead of memory
// so they survive across Edge Function instances.
// ============================================================

import { getSupabase } from '../../supabase.ts';

const db = getSupabase();

// 12 hour TTL for demo sessions
const SESSION_TTL_HOURS = 12;

export type DemoSession = {
  phone:        string;
  state:        string;
  contactName:  string | null;
  schoolName:   string | null;
  schoolType:   string | null;
  location:     string | null;
  studentCount: string | null;
  email:        string | null;
  aiHistory:    Array<{ role: string; content: string }>;
  registered:   boolean;
};

// ─── Get session from DB ───────────────────────────────────
export async function getMarketingSession(
  phone: string
): Promise<DemoSession | null> {
  const cutoff = new Date(
    Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from('demo_sessions')
    .select('*')
    .eq('phone', phone)
    .gte('last_activity', cutoff)
    .maybeSingle();

  if (error || !data) return null;

  return {
    phone:        data.phone,
    state:        data.state        ?? 'WELCOME',
    contactName:  data.contact_name ?? null,
    schoolName:   data.school_name  ?? null,
    schoolType:   data.school_type  ?? null,
    location:     data.location     ?? null,
    studentCount: data.student_count ?? null,
    email:        data.email        ?? null,
    aiHistory:    (data.ai_history as Array<{
      role: string;
      content: string;
    }>) ?? [],
    registered:   data.registered   ?? false,
  };
}

// ─── Save / update session in DB ──────────────────────────
export async function saveMarketingSession(
  session: DemoSession
): Promise<void> {
  await db
    .from('demo_sessions')
    .upsert(
      {
        phone:          session.phone,
        state:          session.state,
        contact_name:   session.contactName,
        school_name:    session.schoolName,
        school_type:    session.schoolType,
        location:       session.location,
        student_count:  session.studentCount,
        email:          session.email,
        ai_history:     session.aiHistory,
        registered:     session.registered,
        interested:     true,
        last_activity:  new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );
}

// ─── Create new session ────────────────────────────────────
export async function createMarketingSession(
  phone: string
): Promise<DemoSession> {
  const session: DemoSession = {
    phone,
    state:        'WELCOME',
    contactName:  null,
    schoolName:   null,
    schoolType:   null,
    location:     null,
    studentCount: null,
    email:        null,
    aiHistory:    [],
    registered:   false,
  };

  await saveMarketingSession(session);
  return session;
}

// ─── Check if active session exists ───────────────────────
// Used by handler.ts to route marketing users early
export async function hasActiveMarketingSession(
  phone: string
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data } = await db
    .from('demo_sessions')
    .select('state')
    .eq('phone', phone)
    .gte('last_activity', cutoff)
    .maybeSingle();

  if (!data) return false;

  // Only return true if past welcome screen
  // Fresh visitors still go through reset check
  // so registered parents/staff are found correctly
  return data.state !== 'WELCOME';
}

// ─── Log demo interaction ──────────────────────────────────
export async function logDemoInteraction(
  phone: string,
  feature: string
): Promise<void> {
  try {
    const { data: session } = await db
      .from('demo_sessions')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (session?.id) {
      await db.from('demo_interactions').insert({
        session_id: session.id,
        feature,
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // Non-critical
  }
}
