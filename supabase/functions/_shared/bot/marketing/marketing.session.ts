// ============================================================
// SCHOOLBOT - MARKETING SESSION SERVICE
// _shared/bot/marketing/marketing.session.ts
// ✅ Tracks sandbox state, role mode, and lead details
// ============================================================

import { getSupabase } from '../../supabase.ts';

const db = getSupabase();

const SESSION_TTL_HOURS = 12;

export type DemoSession = {
  phone:        string;
  state:        string;
  sandboxRole:  'admin' | 'parent';
  contactName:  string | null;
  schoolName:   string | null;
  schoolType:   string | null;
  location:     string | null;
  studentCount: string | null;
  email:        string | null;
  aiHistory:    Array<{ role: 'user' | 'assistant'; content: string }>;
  tempData:     Record<string, unknown>;
  registered:   boolean;
};

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
    state:        data.state         ?? 'WELCOME',
    sandboxRole:  (data.temp_data?.sandboxRole as 'admin' | 'parent') ?? 'admin',
    contactName:  data.contact_name  ?? null,
    schoolName:   data.school_name   ?? null,
    schoolType:   data.school_type   ?? null,
    location:     data.location      ?? null,
    studentCount: data.student_count ?? null,
    email:        data.email         ?? null,
    aiHistory:    (data.ai_history as Array<{
      role:    'user' | 'assistant';
      content: string;
    }>) ?? [],
    tempData:     (data.temp_data as Record<string, unknown>) ?? {},
    registered:   data.registered    ?? false,
  };
}

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
        temp_data:      { ...session.tempData, sandboxRole: session.sandboxRole },
        interested:     true,
        last_activity:  new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );
}

export async function createMarketingSession(
  phone: string
): Promise<DemoSession> {
  const session: DemoSession = {
    phone,
    state:        'WELCOME',
    sandboxRole:  'admin',
    contactName:  null,
    schoolName:   null,
    schoolType:   null,
    location:     null,
    studentCount: null,
    email:        null,
    aiHistory:    [],
    tempData:     {},
    registered:   false,
  };

  await saveMarketingSession(session);
  return session;
}

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

  if (
    data.state === 'REGISTERING'   ||
    data.state === 'TRIAL_ACTIVE'  ||
    data.state === 'NOT_INTERESTED'
  ) {
    return false;
  }

  return true;
}

export async function logDemoInteraction(
  phone:   string,
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
