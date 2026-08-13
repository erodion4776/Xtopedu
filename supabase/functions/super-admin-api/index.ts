// ============================================================
// SCHOOLBOT - SUPER ADMIN API
// supabase/functions/super-admin-api/index.ts
// ============================================================

import { getSupabase } from '../_shared/supabase.ts';
import { PaystackService } from '../_shared/paystack.service.ts';

const db = getSupabase();
const paystack = new PaystackService();

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE',
        'Access-Control-Allow-Headers': 'x-admin-token, Content-Type',
      },
    });
  }

  // Verify token
  const token = req.headers.get('x-admin-token');
  if (!token || token !== Deno.env.get('SUPER_ADMIN_API_TOKEN')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  let path = url.pathname;
  // Supabase's gateway strips "/functions/v1" but leaves the function's
  // own name ("super-admin-api") in the path — strip that too, however
  // much of a prefix is actually present, so this works regardless of
  // how the gateway forwards the URL.
  const marker = '/super-admin-api';
  const markerIndex = path.indexOf(marker);
  if (markerIndex !== -1) {
    path = path.slice(markerIndex + marker.length);
  }
  if (!path.startsWith('/')) path = '/' + path;

  // Temporary trace — logs every request that gets past auth, no matter what.
  console.log('[super-admin-api] incoming', req.method, path, url.search);

  try {
    // Dashboard stats
    if (path === '/stats' && req.method === 'GET') {
      return json(await getStats());
    }

    // All schools
    if (path === '/schools' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') ?? '1');
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      const search = url.searchParams.get('search');
      return json(await getSchools({ page, limit, search }));
    }

    // Single school
    if (path.match(/^\/schools\/[^/]+$/) && req.method === 'GET') {
      return json(await getSchool(path.split('/')[2]));
    }

    // Update school
    if (path.match(/^\/schools\/[^/]+$/) && req.method === 'PATCH') {
      const body = await req.json();
      return json(await updateSchool(path.split('/')[2], body));
    }

    // Revenue
    if (path === '/revenue' && req.method === 'GET') {
      const schoolId = url.searchParams.get('school_id') ?? undefined;
      return json(await paystack.getRevenueStats(schoolId));
    }

    // Payments
    if (path === '/payments' && req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') ?? '1');
      return json(await getPayments(page));
    }

    // Logs
    if (path === '/logs' && req.method === 'GET') {
      const level = url.searchParams.get('level');
      const schoolId = url.searchParams.get('school_id');
      return json(await getLogs(level, schoolId));
    }

    // Debug
    if (path.match(/^\/debug\/[^/]+$/) && req.method === 'GET') {
      return json(await getDebug(path.split('/')[2]));
    }

    // Sessions
    if (path === '/sessions' && req.method === 'GET') {
      return json(await getSessions(url.searchParams.get('school_id')));
    }

    // Leads
    if (path === '/leads' && req.method === 'GET') {
      return json(await getLeads(url.searchParams.get('status')));
    }

    // Verify bank account (resolve account name via Paystack)
    if (path === '/verify-account' && req.method === 'GET') {
      const account = url.searchParams.get('account');
      const bank = url.searchParams.get('bank');
      if (!account || !bank) {
        return json({ error: 'account and bank are required' }, 400);
      }
      const resolved = await paystack.resolveAccount(account, bank);
      if (!resolved.ok) {
        // Log it too so `supabase functions logs super-admin-api` shows the cause
        console.error('[verify-account] Paystack rejected:', resolved.message);
        return json({ message: resolved.message }, 200);
      }
      return json({ account_name: resolved.accountName });
    }

    // Plans
    if (path === '/plans' && req.method === 'GET') {
      const { data } = await db.from('setup_fee_tiers')
        .select('*').eq('is_active', true).order('min_students');
      return json(data);
    }

    console.log('[super-admin-api] no route matched for', path);
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[API] error:', err);
    await db.from('platform_logs').insert({
      level: 'error', category: 'api_error',
      message: String(err),
      details: { path, method: req.method },
      created_at: new Date().toISOString(),
    });
    return json({ error: String(err) }, 500);
  }
});

async function getStats() {
  const now = new Date();
  const sm = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString().split('T')[0];

  const [schools, students, parents, revenue, sessions, messages, tickets] =
    await Promise.all([
      db.from('schools').select('is_active, onboarding_status'),
      db.from('students').select('id', { count: 'exact' }).eq('status', 'active'),
      db.from('parents').select('id', { count: 'exact' }),
      db.from('platform_payments').select('amount').eq('status', 'Success').gte('created_at', sm),
      db.from('bot_sessions').select('id', { count: 'exact' }).gte('last_activity', new Date(Date.now() - 3600000).toISOString()),
      db.from('whatsapp_messages').select('id', { count: 'exact' }).gte('created_at', today),
      db.from('support_tickets').select('id', { count: 'exact' }).in('status', ['open', 'in_progress']),
    ]);

  const s = schools.data ?? [];
  const monthRev = (revenue.data ?? []).reduce(
    (sum, r) => sum + parseFloat(String(r.amount ?? 0)), 0
  );

  return {
    schools: {
      total: s.length,
      active: s.filter((x) => x.is_active).length,
      inactive: s.filter((x) => !x.is_active).length,
    },
    users: { students: students.count ?? 0, parents: parents.count ?? 0 },
    revenue: { this_month: monthRev },
    activity: {
      active_sessions: sessions.count ?? 0,
      messages_today: messages.count ?? 0,
      open_tickets: tickets.count ?? 0,
    },
  };
}

async function getSchools(params: {
  page: number; limit: number; search?: string | null;
}) {
  const offset = (params.page - 1) * params.limit;
  let query = db.from('schools').select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + params.limit - 1);

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,email.ilike.%${params.search}%`
    );
  }

  const { data, count } = await query;
  return { data, total: count ?? 0, page: params.page };
}

async function getSchool(schoolId: string) {
  const [school, students, staff, waAccount] = await Promise.all([
    db.from('schools').select('*').eq('id', schoolId).single(),
    db.from('students').select('id', { count: 'exact' }).eq('school_id', schoolId),
    db.from('staff').select('id', { count: 'exact' }).eq('school_id', schoolId),
    db.from('whatsapp_accounts').select('*').eq('school_id', schoolId).single(),
  ]);
  return {
    school: school.data,
    stats: { students: students.count ?? 0, staff: staff.count ?? 0 },
    whatsapp_account: waAccount.data,
  };
}

async function updateSchool(schoolId: string, body: Record<string, unknown>) {
  const { data, error } = await db.from('schools')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', schoolId).select().single();
  if (error) throw error;
  return data;
}

async function getPayments(page: number) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const { data, count } = await db.from('platform_payments')
    .select('*, schools( name )', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return { data, total: count ?? 0, page };
}

async function getLogs(level: string | null, schoolId: string | null) {
  let query = db.from('platform_logs').select('*, schools( name )')
    .order('created_at', { ascending: false }).limit(50);
  if (level) query = query.eq('level', level);
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data } = await query;
  return data;
}

async function getDebug(schoolId: string) {
  const [sessions, messages, payments, logs] = await Promise.all([
    db.from('bot_sessions').select('*').eq('school_id', schoolId),
    db.from('whatsapp_messages').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(20),
    db.from('payments').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10),
    db.from('platform_logs').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    bot_sessions: sessions.data,
    recent_messages: messages.data,
    recent_payments: payments.data,
    platform_logs: logs.data,
  };
}

async function getSessions(schoolId: string | null) {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let query = db.from('bot_sessions')
    .select('phone, role, state, school_id, last_activity, schools( name )')
    .gte('last_activity', since)
    .order('last_activity', { ascending: false })
    .limit(50);
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data } = await query;
  return data;
}

async function getLeads(status: string | null) {
  let query = db.from('leads').select('*')
    .order('created_at', { ascending: false }).limit(50);
  if (status) query = query.eq('status', status);
  const { data } = await query;
  return data;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
