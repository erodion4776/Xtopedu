// ============================================================
// SCHOOLBOT - MARKETING SESSION SERVICE
// _shared/bot/marketing/marketing.session.ts
// ✅ Clean DB upserts without invalid column errors
// ✅ Robust session retrieval and TTL checks
// ============================================================

import { getSupabase } from '../../supabase.ts';

const db = getSupabase();

const SESSION_TTL_HOURS = 24;

export type DemoSession = {
  phone:        string;
  state:        string;
  contactName:  string | null;
  schoolName:   string | null;
  schoolType:   string | null;
  location:     string | null;
  studentCount: string | null;
  email:        string | null;
  aiHistory:    Array<{ role: 'user' | 'assistant'; content: string }>;
  registered:   boolean;
};

export async function getMarketingSession(
  phone: string
): Promise<DemoSession | null> {
  try {
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
      state:        data.state         ?? 'SANDBOX_HUB',
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
      registered:   data.registered    ?? false,
    };
  } catch (err) {
    console.error('[MarketingSession] get error:', err);
    return null;
  }
}

export async function saveMarketingSession(
  session: DemoSession
): Promise<void> {
  try {
    const { error } = await db
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

    if (error) {
      console.error('[MarketingSession] save error:', error.message);
    }
  } catch (err) {
    console.error('[MarketingSession] save unexpected error:', err);
  }
}

export async function createMarketingSession(
  phone: string
): Promise<DemoSession> {
  const session: DemoSession = {
    phone,
    state:        'SANDBOX_HUB',
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

export async function hasActiveMarketingSession(
  phone: string
): Promise<boolean> {
  try {
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
  } catch {
    return false;
  }
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
