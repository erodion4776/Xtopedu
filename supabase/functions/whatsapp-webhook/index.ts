// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (STANDALONE SAFE VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { getSupabase } from '../_shared/supabase.ts';
import { WhatsApp } from '../_shared/whatsapp.ts';
import type { WebhookBody, IncomingMessage } from '../_shared/types.ts';

const db = getSupabase();

Deno.serve(async (req: Request): Promise<Response> => {
  // ── Verify webhook ─────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken =
      Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ── Receive messages ───────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body: WebhookBody = await req.json();
      await processWebhook(body);
      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[Webhook Error]', err);
      return new Response(
        JSON.stringify({ error: String(err) }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processWebhook(body: WebhookBody): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // ignore statuses for now
  if (value.statuses?.length) {
    console.log('[Status update]', JSON.stringify(value.statuses));
    return;
  }

  if (!value.messages?.length) return;

  const message = value.messages[0];
  const phone = message.from;

  console.log('[Incoming]', JSON.stringify(message));

  // save raw webhook
  await db.from('whatsapp_webhooks').insert({
    event_type: 'incoming',
    payload: body,
    processed: false,
    created_at: new Date().toISOString(),
  }).catch(() => {});

  const wa = new WhatsApp();

  const rawText = getRawText(message);
  const input = getInput(message);

  // ── Check if sender is super admin ─────────────────────────
  const formattedPhone = formatPhone(phone);

  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active')
    .or(`phone.eq.${formattedPhone},whatsapp_number.eq.${formattedPhone}`)
    .eq('is_active', true)
    .single();

  // ────────────────────────────────────────────────────────────
  // SUPER ADMIN FLOW
  // ────────────────────────────────────────────────────────────
  if (platformAdmin) {
    if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
      const [
        schoolsRes,
        leadsRes,
        revenueRes,
      ] = await Promise.all([
        db.from('schools').select('id', { count: 'exact' }),
        db.from('leads').select('id', { count: 'exact' }),
        db.from('platform_payments')
          .select('amount')
          .eq('status', 'Success'),
      ]);

      const totalRevenue = (revenueRes.data ?? []).reduce(
        (sum, r) => sum + parseFloat(String(r.amount ?? 0)),
        0
      );

      await wa.list(
        phone,
        '🔐 XtopEdu Admin',
        `Welcome *${platformAdmin.full_name.split(' ')[0]}!* 👋\n\n` +
          `📊 *Quick Stats*\n` +
          `🏫 Schools: *${schoolsRes.count ?? 0}*\n` +
          `🧲 Leads: *${leadsRes.count ?? 0}*\n` +
          `💰 Revenue: *${formatCurrency(totalRevenue)}*\n\n` +
          `What would you like to do?`,
        'Super Admin Panel',
        '🔐 Open Menu',
        [
          {
            title: 'Admin Options',
            rows: [
              {
                id: 'ADMIN_SCHOOLS',
                title: '🏫 Schools',
                description: 'View school counts',
              },
              {
                id: 'ADMIN_LEADS',
                title: '🧲 Leads',
                description: 'View incoming leads',
              },
              {
                id: 'ADMIN_REVENUE',
                title: '💰 Revenue',
                description: 'View total revenue',
              },
            ],
          },
        ]
      );
      return;
    }

    if (input === 'admin_schools') {
      const { data: schools } = await db
        .from('schools')
        .select('name, student_count, is_active, onboarding_status')
        .order('created_at', { ascending: false })
        .limit(10);

      const text = !schools?.length
        ? 'No schools registered yet.'
        : schools.map((s, i) =>
            `${i + 1}. *${s.name}*\n` +
            `   👥 ${s.student_count ?? 0} students\n` +
            `   ${s.is_active ? '✅ Active' : '❌ Inactive'} • ${s.onboarding_status}`
          ).join('\n\n');

      await wa.text(phone, `🏫 *Schools*\n\n${text}\n\nType *menu* to go back.`);
      return;
    }

    if (input === 'admin_leads') {
      const { data: leads } = await db
        .from('leads')
        .select('contact_name, school_name, phone, status')
        .order('created_at', { ascending: false })
        .limit(10);

      const text = !leads?.length
        ? 'No leads yet.'
        : leads.map((l, i) =>
            `${i + 1}. *${l.contact_name}*\n` +
            `   🏫 ${l.school_name}\n` +
            `   📱 ${l.phone}\n` +
            `   🏷️ ${l.status}`
          ).join('\n\n');

      await wa.text(phone, `🧲 *Leads*\n\n${text}\n\nType *menu* to go back.`);
      return;
    }

    if (input === 'admin_revenue') {
      const { data: rev } = await db
        .from('platform_payments')
        .select('amount, payment_type')
        .eq('status', 'Success');

      const rows = rev ?? [];
      const setup = rows
        .filter((r) => r.payment_type === 'setup_fee')
        .reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

      const commissions = rows
        .filter((r) => r.payment_type === 'commission')
        .reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

      await wa.text(
        phone,
        `💰 *Revenue Summary*\n\n` +
          `🔧 Setup Fees: *${formatCurrency(setup)}*\n` +
          `💸 Commissions: *${formatCurrency(commissions)}*\n` +
          `━━━━━━━━━━━━\n` +
          `💵 Total: *${formatCurrency(setup + commissions)}*\n\n` +
          `Type *menu* to go back.`
      );
      return;
    }

    await wa.text(phone, `Type *menu* to open admin options.`);
    return;
  }

  // ────────────────────────────────────────────────────────────
  // DEMO / MARKETING FLOW
  // ────────────────────────────────────────────────────────────
  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    await db.from('demo_sessions').upsert({
      phone: formattedPhone,
      state: 'WELCOME',
      ai_context: [],
      interested: true,
      registered: false,
      demo_completed: false,
      last_activity: new Date().toISOString(),
    }, { onConflict: 'phone' }).catch(() => {});

    await wa.list(
      phone,
      '🏫 SchoolBot Demo',
      `Welcome! 👋\n\n` +
        `SchoolBot helps schools manage:\n` +
        `✅ Attendance with parent alerts\n` +
        `💰 Fee collection & payments\n` +
        `🚗 Pickup security\n` +
        `📊 Reports & analytics\n\n` +
        `What would you like to explore?`,
      'Powered by XtopEdu',
      '🎯 See Demo',
      [
        {
          title: 'Demo Features',
          rows: [
            {
              id: 'DEMO_ATTENDANCE',
              title: '✅ Attendance Demo',
              description: 'See parent alerts',
            },
            {
              id: 'DEMO_FEES',
              title: '💰 Fee Collection Demo',
              description: 'See payment flow',
            },
            {
              id: 'DEMO_PICKUP',
              title: '🚗 Pickup Security Demo',
              description: 'See pickup alerts',
            },
            {
              id: 'DEMO_PRICING',
              title: '💵 Pricing',
              description: 'See setup fee',
            },
            {
              id: 'REGISTER_SCHOOL',
              title: '🏫 Register My School',
              description: 'Start onboarding',
            },
          ],
        },
      ]
    );
    return;
  }

  if (input === 'demo_attendance') {
    await wa.text(
      phone,
      `✅ *Attendance Demo*\n\n` +
        `When a teacher marks a student absent,\n` +
        `the parent gets this immediately:\n\n` +
        `❌ *Absence Alert*\n` +
        `Your child Chidi Okonkwo was marked absent today.\n` +
        `🏫 Class: JSS 3A\n\n` +
        `📊 Benefits:\n` +
        `• Parents know instantly\n` +
        `• Absences reduce quickly\n` +
        `• Trust improves`
    );
    return;
  }

  if (input === 'demo_fees') {
    await wa.text(
      phone,
      `💰 *Fee Collection Demo*\n\n` +
        `Parent sees:\n\n` +
        `School Fee: ${formatCurrency(50000)}\n` +
        `Platform Fee: ${formatCurrency(750)}\n` +
        `Processing Fee: ${formatCurrency(125)}\n` +
        `━━━━━━━━━━━━\n` +
        `Total: ${formatCurrency(50875)}\n\n` +
        `🏫 School still receives the full ${formatCurrency(50000)} ✅`
    );
    return;
  }

  if (input === 'demo_pickup') {
    await wa.text(
      phone,
      `🚗 *Pickup Security Demo*\n\n` +
        `When a child is picked up, parent gets:\n\n` +
        `🚗 Pickup Notification\n` +
        `✅ Amara Adeleke has been picked up!\n` +
        `👤 By: Mrs. Funmi Adeleke\n` +
        `⏰ Time: 2:30 PM\n\n` +
        `If unauthorized, parent knows immediately.`
    );
    return;
  }

  if (input === 'demo_pricing') {
    await wa.text(
      phone,
      `💵 *SchoolBot Pricing*\n\n` +
        `One-Time Setup Fee:\n` +
        `1-100 students: ₦25,000\n` +
        `101-300 students: ₦50,000\n` +
        `301-500 students: ₦80,000\n` +
        `501-1000 students: ₦120,000\n` +
        `1000+ students: ₦180,000+\n\n` +
        `Plus 1.5% per fee payment.\n` +
        `Your school still receives 100% of school fees.`
    );
    return;
  }

  if (input === 'register_school') {
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\n` +
        `Great! Let's begin.\n\n` +
        `Please reply with your *full name*.`
    );
    return;
  }

  await wa.text(phone, `Type *hi* to open the SchoolBot menu.`);
}

// ─── Helpers ──────────────────────────────────────────────────
function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '234' + p.slice(1);
  return p;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);
}

function getInput(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim().toLowerCase() ?? '';
  }
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.id?.toLowerCase() ??
      message.interactive?.list_reply?.id?.toLowerCase() ??
      ''
    );
  }
  return '';
}

function getRawText(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}
