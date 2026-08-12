// ============================================================
// SCHOOLBOT - MARKETING SESSION SERVICE
// _shared/bot/marketing/marketing.session.ts
// ============================================================

import { getSupabase } from '../../supabase.ts';

const db = getSupabase();

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
    contactName:  data.contact_name  ?? null,
    schoolName:   data.school_name   ?? null,
    schoolType:   data.school_type   ?? null,
    location:     data.location      ?? null,
    studentCount: data.student_count ?? null,
    email:        data.email         ?? null,
    aiHistory:    (data.ai_history as Array<{
      role:    string;
      content: string;
    }>) ?? [],
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

// ✅ Returns false for states where user should NOT
// be routed to marketing bot
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

  // ✅ These states should NOT route to marketing:
  //
  // WELCOME — new visitor, check DB identity first
  //
  // REGISTERING — in onboarding flow
  //
  // TRIAL_ACTIVE — activated trial, registering
  //
  // NOT_INTERESTED — ended conversation
  //
  // Note: After showComplete() deletes demo_sessions,
  // this function returns false automatically ✅
  if (
    data.state === 'WELCOME'       ||
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
    await db
      .from('demo_sessions')
      .upsert(
        {
          phone,
          state:         'DEMO_MENU',
          interested:    true,
          registered:    false,
          last_activity: new Date().toISOString(),
        },
        { onConflict: 'phone' }
      );

    const { data: session } = await db
      .from('demo_sessions')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (session?.id) {
      await db.from('demo_interactions').insert({
        session_id:  session.id,
        feature,
        created_at:  new Date().toISOString(),
      });
    }
  } catch {
    // Non-critical
  }
}
