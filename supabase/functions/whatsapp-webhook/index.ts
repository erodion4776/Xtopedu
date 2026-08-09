// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (SAFE MENU VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import type { WebhookBody } from '../_shared/types.ts';
import { WhatsApp } from '../_shared/whatsapp.ts';
import { getSupabase } from '../_shared/supabase.ts';
import {
  getOnboardingSession,
  handleOnboardingInput,
  startOnboardingSession,
  handleInvitationToken,
} from '../_shared/onboarding/engine.ts';

const db = getSupabase();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

Deno.serve(async (req: Request): Promise<Response> => {
  // ── GET: Webhook verification ──────────────────────────────
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

  // ── POST: Incoming webhook ─────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body: WebhookBody = await req.json();

      // Process immediately, then return 200
      await processWebhook(body);

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[WEBHOOK ERROR]', err);
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
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  // Save webhook for debugging
  await db.from('whatsapp_webhooks').insert({
    event_type: 'incoming',
    payload: body,
    processed: false,
    created_at: new Date().toISOString(),
  }).catch(() => {});

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // Ignore status updates for now
  if (value.statuses?.length) {
    return;
  }

  if (!value.messages?.length) return;

  const message = value.messages[0];
  const phone = message.from;
  const wa = new WhatsApp();

  // Only support text + interactive for now
  if (!['text', 'interactive'].includes(message.type)) {
    await wa.text(
      phone,
      `I can only understand text messages and menu selections for now.\n\nType *hi* to continue.`
    );
    return;
  }

  const rawText = getRawText(message);
  const input = getInput(message);

  console.log('[BOT INPUT]', { phone, input, rawText });

  // ── Staff invite token check ────────────────────────────────
  if (message.type === 'text' && /^[A-Z0-9]{8}$/i.test(rawText.trim())) {
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ── Onboarding flow check ───────────────────────────────────
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const handled = await handleOnboardingInput(
      phone,
      input,
      rawText,
      wa,
      obSession.source
    );
    if (handled) return;
  }

  // ── Check if sender is you (platform admin) ─────────────────
  const formattedPhone = formatPhone(phone);

  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active')
    .or(`phone.eq.${formattedPhone},whatsapp_number.eq.${formattedPhone}`)
    .eq('is_active', true)
    .single();

  if (platformAdmin) {
    await handleSuperAdminMenu(phone, input, platformAdmin.full_name, wa);
    return;
  }

  // ── Unknown user / school owner flow ────────────────────────
  await handleMarketingMenu(phone, input, rawText, wa);
}

// ============================================================
// SUPER ADMIN MENU (for your own number)
// ============================================================

async function handleSuperAdminMenu(
  phone: string,
  input: string,
  fullName: string,
  wa: WhatsApp
): Promise<void> {
  const firstName = fullName.split(' ')[0] ?? 'Admin';

  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    // Quick stats
    const [schools, leads, payments] = await Promise.all([
      db.from('schools').select('id', { count: 'exact' }),
      db.from('leads').select('id', { count: 'exact' }),
      db.from('platform_payments').select('amount').eq('status', 'Success'),
    ]);

    const totalRevenue = (payments.data ?? []).reduce(
      (sum, p) => sum + parseFloat(String(p.amount ?? 0)),
      0
    );

    await wa.list(
      phone,
      `🔐 XtopEdu Admin`,
      `Welcome *${firstName}!* 👋\n\n` +
      `📊 *Quick Stats*\n` +
      `🏫 Schools: *${schools.count ?? 0}*\n` +
      `🧲 Leads: *${leads.count ?? 0}*\n` +
      `💰 Revenue: *${fmt(totalRevenue)}*\n\n` +
      `What would you like to do?`,
      `Super Admin Panel`,
      `🔐 Open Menu`,
      [
        {
          title: 'Platform',
          rows: [
            {
              id: 'ADMIN_SCHOOLS',
              title: '🏫 Schools',
              description: 'View all schools',
            },
            {
              id: 'ADMIN_REVENUE',
              title: '💰 Revenue',
              description: 'See total earnings',
            },
            {
              id: 'ADMIN_LEADS',
              title: '🧲 Leads',
              description: 'See school signups',
            },
            {
              id: 'ADMIN_BOT_TEST',
              title: '🤖 Bot Test',
              description: 'Check bot is working',
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
      .select('name, student_count, onboarding_status, is_active')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!schools?.length) {
      await wa.text(phone, `No schools registered yet.`);
      return;
    }

    const lines = schools.map((s, i) =>
      `${i + 1}. *${s.name}*\n` +
      `   👥 ${s.student_count ?? 0} students\n` +
      `   ${s.is_active ? '✅ Active' : '❌ Inactive'} • ${s.onboarding_status}`
    ).join('\n\n');

    await wa.text(
      phone,
      `🏫 *Recent Schools*\n\n${lines}\n\nType *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_revenue') {
    const { data: payments } = await db
      .from('platform_payments')
      .select('amount, payment_type')
      .eq('status', 'Success');

    const rows = payments ?? [];
    const setup = rows
      .filter((p) => p.payment_type === 'setup_fee')
      .reduce((s, p) => s + parseFloat(String(p.amount ?? 0)), 0);

    const commission = rows
      .filter((p) => p.payment_type === 'commission')
      .reduce((s, p) => s + parseFloat(String(p.amount ?? 0)), 0);

    await wa.text(
      phone,
      `💰 *Revenue Summary*\n\n` +
      `🔧 Setup Fees: *${fmt(setup)}*\n` +
      `💸 Commissions: *${fmt(commission)}*\n` +
      `━━━━━━━━━━━━\n` +
      `💵 Total: *${fmt(setup + commission)}*\n\n` +
      `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_leads') {
    const { data: leads } = await db
      .from('leads')
      .select('contact_name, school_name, phone, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!leads?.length) {
      await wa.text(phone, `No leads yet.`);
      return;
    }

    const lines = leads.map((l, i) =>
      `${i + 1}. *${l.contact_name}*\n` +
      `   🏫 ${l.school_name}\n` +
      `   📱 ${l.phone}\n` +
      `   🏷️ ${l.status}`
    ).join('\n\n');

    await wa.text(
      phone,
      `🧲 *Recent Leads*\n\n${lines}\n\nType *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_bot_test') {
    await wa.text(
      phone,
      `✅ *Bot Test Successful!*\n\n` +
      `Your SchoolBot is working correctly.\n\n` +
      `• Webhook ✅\n` +
      `• Sending ✅\n` +
      `• Menus ✅`
    );
    return;
  }

  await wa.text(phone, `Type *menu* to open your admin panel.`);
}

// ============================================================
// MARKETING / DEMO MENU (for school owners / unknown users)
// ============================================================

async function handleMarketingMenu(
  phone: string,
  input: string,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  if (['hi', 'hello', 'start', 'menu', 'main_menu'].includes(input)) {
    // Log a demo session
    await db.from('demo_sessions').upsert({
      phone: formatPhone(phone),
      state: 'WELCOME',
      ai_context: [],
      interested: true,
      registered: false,
      demo_completed: false,
      last_activity: new Date().toISOString(),
    }, { onConflict: 'phone' }).catch(() => {});

    await wa.text(
      phone,
      `👋 *Welcome to SchoolBot!*\n\n` +
      `I'm *Sabi* — your SchoolBot assistant! 🤖✨\n\n` +
      `SchoolBot helps schools manage:\n` +
      `✅ Attendance with parent alerts\n` +
      `💰 Fee collection & online payments\n` +
      `🚗 Pickup security\n` +
      `📊 Reports & analytics\n\n` +
      `What would you like to see?`
    );

    await new Promise((r) => setTimeout(r, 1000));

    await wa.list(
      phone,
      `🏫 SchoolBot Demo`,
      `Choose a feature to explore:`,
      `Powered by XtopEdu`,
      `🎯 See Demo`,
      [
        {
          title: 'Demo Features',
          rows: [
            {
              id: 'DEMO_ATTENDANCE',
              title: '✅ Attendance Demo',
              description: 'See parent alerts in action',
            },
            {
              id: 'DEMO_FEES',
              title: '💰 Fee Collection Demo',
              description: 'See online payment flow',
            },
            {
              id: 'DEMO_PICKUP',
              title: '🚗 Pickup Security Demo',
              description: 'See pickup notifications',
            },
            {
              id: 'DEMO_PRICING',
              title: '💵 Pricing',
              description: 'See setup fee and charges',
            },
            {
              id: 'REGISTER_SCHOOL',
              title: '🏫 Register My School',
              description: 'Start onboarding now',
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
      `When a teacher marks a child absent,\n` +
      `the parent receives instantly:\n\n` +
      `❌ *Absence Alert*\n` +
      `Your child Chidi Okonkwo was marked absent today.\n` +
      `🏫 Class: JSS 3A\n\n` +
      `📊 Results:\n` +
      `• 98.4% delivery rate\n` +
      `• 412 parents notified in 2 mins\n` +
      `• Absences reduced by 67%`
    );

    await new Promise((r) => setTimeout(r, 1000));

    await wa.buttons(
      phone,
      `Want to explore more?`,
      [
        { id: 'DEMO_FEES', title: '💰 Fee Demo' },
        { id: 'DEMO_PICKUP', title: '🚗 Pickup' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_fees') {
    await wa.text(
      phone,
      `💰 *Fee Collection Demo*\n\n` +
      `Parent sees:\n\n` +
      `💵 School Fee:     ${fmt(50000)}\n` +
      `🏷️ Platform Fee:   ${fmt(750)} (1.5%)\n` +
      `🏦 Processing Fee: ${fmt(125)}\n` +
      `━━━━━━━━━━━━\n` +
      `💳 Total: ${fmt(50875)}\n\n` +
      `🏫 School still receives *${fmt(50000)}* in full ✅\n\n` +
      `Collection rates improve from 58% → 91%!`
    );

    await new Promise((r) => setTimeout(r, 1000));

    await wa.buttons(
      phone,
      `Would you like to continue?`,
      [
        { id: 'DEMO_PICKUP', title: '🚗 Pickup Demo' },
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_pickup') {
    await wa.text(
      phone,
      `🚗 *Pickup Security Demo*\n\n` +
      `When a child is picked up, the parent gets:\n\n` +
      `🚗 *Pickup Notification*\n` +
      `✅ Amara Adeleke has been picked up!\n` +
      `👤 By: Mrs. Funmi Adeleke\n` +
      `⏰ Time: 2:30 PM\n\n` +
      `If unauthorized, the parent knows immediately.\n\n` +
      `🔐 Every pickup is logged and verified.`
    );

    await new Promise((r) => setTimeout(r, 1000));

    await wa.buttons(
      phone,
      `This keeps children safer. What next?`,
      [
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'DEMO_ATTENDANCE', title: '↩️ Back' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_pricing') {
    await wa.text(
      phone,
      `💵 *SchoolBot Pricing*\n\n` +
      `*One-Time Setup Fee*\n\n` +
      `👥 1-100 students: ₦25,000\n` +
      `👥 101-300 students: ₦50,000\n` +
      `👥 301-500 students: ₦80,000\n` +
      `👥 501-1000 students: ₦120,000\n` +
      `👥 1000+ students: ₦180,000+\n\n` +
      `*Plus 1.5% commission per fee payment*\n` +
      `(added on parent bill)\n` +
      `Your school gets *100%* of fee payments. ✅\n\n` +
      `No monthly subscription!`
    );

    await new Promise((r) => setTimeout(r, 1000));

    await wa.buttons(
      phone,
      `Ready to register your school?`,
      [
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
        { id: 'DEMO_ATTENDANCE', title: '↩️ Back' },
      ]
    );
    return;
  }

  if (input === 'register_school') {
    startOnboardingSession(phone, 'main');
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\n` +
      `Great! Let’s get started.\n\n` +
      `What is your *full name*?`
    );
    return;
  }

  // Fallback
  await wa.text(
    phone,
    `Type *hi* to start the SchoolBot demo.`
  );
}

// ============================================================
// HELPERS
// ============================================================

function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '234' + p.slice(1);
  return p;
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
