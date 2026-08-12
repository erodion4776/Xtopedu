// ============================================================
// SCHOOLBOT - MARKETING SESSION SERVICE
// _shared/bot/marketing/marketing.session.ts
// ✅ Fixed: hasActiveMarketingSession returns false
//    for REGISTERING state so admin panel works after setup
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

// ─── Save session to DB ────────────────────────────────────
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

// ─── Check if active marketing session exists ──────────────
// ✅ Returns false for states that indicate the user
// has moved past the marketing demo into onboarding
// or has completed setup and is now an admin.
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

  // ✅ Do NOT route to marketing bot for these states:
  //
  // WELCOME — brand new user, let reset check DB first
  //           so registered parents/staff are found
  //
  // REGISTERING — user clicked "Register Now" and is
  //               going through onboarding engine
  //               (engine.ts handles their messages)
  //
  // NOT_INTERESTED — user said no, session inactive
  //
  // After showComplete() clears demo_sessions,
  // this function returns false automatically ✅
  if (
    data.state === 'WELCOME'       ||
    data.state === 'REGISTERING'   ||
    data.state === 'NOT_INTERESTED'
  ) {
    return false;
  }

  return true;
}

// ─── Log demo interaction ──────────────────────────────────
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
