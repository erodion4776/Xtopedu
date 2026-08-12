// ============================================================
// SCHOOLBOT - MARKETING BOT HANDLER
// _shared/bot/marketing/marketing.handler.ts
// ============================================================

import { WhatsApp }    from '../../whatsapp.ts';
import { AIService }   from '../../ai.service.ts';
import { getSupabase } from '../../supabase.ts';
import { formatPhone } from '../../utils.ts';
import {
  getOnboardingSession,
  handleOnboardingInput,
  startOnboardingSession,
  handleInvitationToken,
  showSetupFeeInfo,
} from '../../onboarding/engine.ts';
import {
  DEMO_SCHOOL,
  DEMO_ATTENDANCE,
  DEMO_FEES,
  DEMO_PICKUP,
  DEMO_REPORTS,
  SETUP_FEE_TIERS,
} from './marketing.data.ts';
import {
  getMarketingSession,
  saveMarketingSession,
  createMarketingSession,
  logDemoInteraction,
  type DemoSession,
} from './marketing.session.ts';

export {
  hasActiveMarketingSession,
} from './marketing.session.ts';

import type { IncomingMessage } from '../../types.ts';

const ai = new AIService();
const db = getSupabase();

// ─── Reset keywords ───────────────────────────────────────
const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start', 'menu',
]);

// ─── Trial code pattern ───────────────────────────────────
const TRIAL_CODE_PATTERN =
  /^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

// ─── Currency formatter ───────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

// ─── Delay helper ─────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Get platform WhatsApp client ─────────────────────────
function getPlatformWa(): WhatsApp {
  return new WhatsApp({
    phone_number_id:
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    access_token:
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
    status: 'active',
  });
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function handleMarketingMessage(
  message: IncomingMessage
): Promise<void> {
  const phone = message.from;
  const wa    = getPlatformWa();

  const rawText =
    message.type === 'text'
      ? message.text?.body?.trim() ?? ''
      : '';

  const buttonId =
    message.type === 'interactive'
      ? message.interactive?.button_reply?.id
          ?.toLowerCase() ?? ''
      : '';

  const listId =
    message.type === 'interactive'
      ? message.interactive?.list_reply?.id
          ?.toLowerCase() ?? ''
      : '';

  const input =
    buttonId || listId || rawText.toLowerCase().trim();

  // ── Staff invite token ──────────────────────────────────
  if (/^[A-Z0-9]{8}$/i.test(rawText.trim())) {
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ✅ Trial code check
  if (TRIAL_CODE_PATTERN.test(rawText.trim())) {
    await handleTrialCode(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ── Check onboarding session FIRST ─────────────────────
  const obSession = await getOnboardingSession(phone);
  if (obSession) {
    console.log(
      `[Marketing] Onboarding session | ` +
      `step: ${obSession.step}`
    );
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── Get demo session from DB ────────────────────────────
  let session = await getMarketingSession(
    formatPhone(phone)
  );

  // Reset or new user — show welcome
  if (!input || RESET_KEYWORDS.has(input) || !session) {
    session = await createMarketingSession(
      formatPhone(phone)
    );
    await sendWelcome(phone, session, wa);
    return;
  }

  // ── Registration triggers ───────────────────────────────
  if ([
    'register_now',
    'start_onboarding',
    'start_trial',
  ].includes(input)) {
    await startRegistration(phone, session, wa);
    return;
  }

  // ── Button or list selection ────────────────────────────
  if (buttonId || listId) {
    await handleMenuSelection(phone, session, input, wa);
    return;
  }

  // ── Text input ──────────────────────────────────────────
  await handleTextInput(
    phone, session, rawText, input, wa
  );
}

// ============================================================
// ✅ TRIAL CODE HANDLER
// ============================================================

async function handleTrialCode(
  phone: string,
  code:  string,
  wa:    WhatsApp
): Promise<void> {
  console.log(
    `[Marketing] Trial code attempt: ${code} from ${phone}`
  );

  // Look up the code
  const { data, error } = await db
    .from('trial_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  // Code not found
  if (error || !data) {
    await wa.text(
      phone,
      `❌ *Invalid Code*\n\n` +
      `The code *${code}* is not valid.\n\n` +
      `Please check the code and try again.\n\n` +
      `Type *hi* to see our demo or\n` +
      `contact us for help.`
    );
    return;
  }

  // Already used
  if (data.used) {
    await wa.text(
      phone,
      `❌ *Code Already Used*\n\n` +
      `This trial code has already been used.\n\n` +
      `Each code is for one school only.\n\n` +
      `Type *hi* to see our demo or\n` +
      `contact us for a new code:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
    return;
  }

  // Expired
  if (new Date(data.expires_at) < new Date()) {
    await wa.text(
      phone,
      `❌ *Code Expired*\n\n` +
      `This trial code has expired.\n\n` +
      `Please contact us for a new code:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*\n\n` +
      `Type *hi* to see our demo.`
    );
    return;
  }

  // ✅ Valid! Mark as used immediately
  await db
    .from('trial_codes')
    .update({
      used:          true,
      used_at:       new Date().toISOString(),
      used_by_phone: formatPhone(phone),
    })
    .eq('id', data.id);

  // Save trial session to DB
  await db
    .from('trial_sessions')
    .upsert(
      {
        phone:      formatPhone(phone),
        code,
        active:     true,
        expires_at: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );

  // Update demo session state
  let session = await getMarketingSession(
    formatPhone(phone)
  );
  if (!session) {
    session = await createMarketingSession(
      formatPhone(phone)
    );
  }
  session.state = 'TRIAL_ACTIVE';
  await saveMarketingSession(session);

  // Notify super admin
  const superPhone =
    Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
  if (superPhone) {
    const notifyWa = new WhatsApp({
      phone_number_id:
        Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
      access_token:
        Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
      status: 'active',
    });
    await notifyWa.text(
      superPhone,
      `🎁 *Trial Code Used!*\n\n` +
      `Code: *${code}*\n` +
      `School: ${data.school_name ?? 'Unknown'}\n` +
      `Phone: ${formatPhone(phone)}\n` +
      `⏰ ${new Date().toLocaleString('en-NG')}`
    ).catch(() => {});
  }

  // Send success message to school
  await wa.text(
    phone,
    `🎉 *Free Trial Activated!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ Your trial code is valid!\n\n` +
    `*What you get FREE:*\n` +
    `🆓 Setup fee — *WAIVED*\n` +
    `✅ WhatsApp bot for parents\n` +
    `✅ Attendance management\n` +
    `✅ Fee collection system\n` +
    `✅ Student pickup security\n` +
    `✅ School reports & analytics\n` +
    `✅ Lifetime access\n\n` +
    `⏰ *Valid for 24 hours only!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Ready to register your school? 🚀`
  );

  await delay(1000);

  await wa.buttons(
    phone,
    `Register now and get started for FREE!`,
    [
      {
        id:    'register_now',
        title: '🚀 Register Now FREE',
      },
      {
        id:    'demo_attendance',
        title: '👀 See Demo First',
      },
    ]
  );
}

// ============================================================
// MENU SELECTION HANDLER
// ============================================================

async function handleMenuSelection(
  phone:   string,
  session: DemoSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {
    case 'demo_attendance':
      await showAttendanceDemo(phone, session, wa);
      break;
    case 'demo_fees':
      await showFeesDemo(phone, session, wa);
      break;
    case 'demo_pickup':
      await showPickupDemo(phone, session, wa);
      break;
    case 'demo_reports':
      await showReportsDemo(phone, session, wa);
      break;
    case 'att_parent_view':
      await showParentAttView(phone, session, wa);
      break;
    case 'att_admin_view':
      await showAdminAttView(phone, session, wa);
      break;
    case 'fees_parent_view':
      await showParentFeesView(phone, session, wa);
      break;
    case 'fees_payment_demo':
      await showPaymentDemo(phone, session, wa);
      break;
    case 'see_pricing':
      await showPricing(phone, session, wa);
      break;
    case 'register_now':
    case 'start_onboarding':
    case 'start_trial':
      await startRegistration(phone, session, wa);
      break;
    case 'talk_to_us':
      await showContactOptions(phone, session, wa);
      break;
    case 'main_menu':
    case 'back_to_menu':
      await showDemoMainMenu(phone, session, wa);
      break;
    default:
      if (input.startsWith('tier_')) {
        await startRegistration(phone, session, wa);
      } else {
        await handleAI(phone, session, input, wa);
      }
  }
}

// ============================================================
// TEXT INPUT HANDLER
// ============================================================

async function handleTextInput(
  phone:   string,
  session: DemoSession,
  rawText: string,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  // Guard — user is in registration flow
  if (
    session.state === 'REGISTERING' ||
    session.state === 'WELCOME'     ||
    session.state === 'TRIAL_ACTIVE'
  ) {
    await showDemoMainMenu(phone, session, wa);
    return;
  }

  // Collecting name
  if (session.state === 'COLLECTING_NAME') {
    if (rawText.trim().length >= 2) {
      session.contactName = rawText.trim();
      session.state       = 'DEMO_MENU';
      await saveMarketingSession(session);

      const firstName = rawText.split(' ')[0];
      await wa.text(
        phone,
        `Nice to meet you *${firstName}!* 😊`
      );
      await delay(800);
      await showDemoMainMenu(phone, session, wa);
    } else {
      await wa.text(
        phone,
        `Please enter your full name:`
      );
    }
    return;
  }

  // Everything else → AI
  await handleAI(phone, session, rawText, wa);
}

// ============================================================
// AI HANDLER
// ============================================================

async function handleAI(
  phone:   string,
  session: DemoSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const history = session.aiHistory as Array<{
    role:    'user' | 'assistant';
    content: string;
  }>;

  history.push({ role: 'user', content: input });

  const { intent, entities } =
    await ai.detectIntent(input);

  if (entities?.school_name && !session.schoolName) {
    session.schoolName = entities.school_name;
  }
  if (entities?.location && !session.location) {
    session.location = entities.location;
  }

  const aiResponse = await ai.chat(history, {
    contactName: session.contactName ?? null,
    schoolName:  session.schoolName  ?? null,
    registered:  session.registered  ?? false,
    intent,
  });

  history.push({
    role:    'assistant',
    content: aiResponse,
  });
  session.aiHistory = history.slice(-20);
  await saveMarketingSession(session);

  await wa.text(phone, aiResponse);
  await delay(1500);
  await handleIntentFollowUp(
    phone, session, intent, wa
  );
}

// ─── Intent follow-up ─────────────────────────────────────
async function handleIntentFollowUp(
  phone:   string,
  session: DemoSession,
  intent:  string,
  wa:      WhatsApp
): Promise<void> {
  switch (intent) {
    case 'attendance_demo':
      await showAttendanceDemo(phone, session, wa);
      break;
    case 'fees_demo':
      await showFeesDemo(phone, session, wa);
      break;
    case 'pickup_demo':
      await showPickupDemo(phone, session, wa);
      break;
    case 'pricing':
      await showPricing(phone, session, wa);
      break;
    case 'register':
      await startRegistration(phone, session, wa);
      break;
    case 'see_demo':
      await showDemoMainMenu(phone, session, wa);
      break;
    case 'not_interested':
      await handleNotInterested(phone, session, wa);
      break;
    default:
      if (intent !== 'question') {
        await showQuickOptions(phone, wa);
      }
  }
}

// ============================================================
// WELCOME
// ============================================================

async function sendWelcome(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `I'm *Sabi* — your SchoolBot assistant! 🤖✨\n\n` +
    `SchoolBot helps Nigerian schools manage:\n` +
    `✅ Student attendance (WhatsApp alerts)\n` +
    `💰 Fee collection & online payments\n` +
    `🚗 Student pickup management\n` +
    `📊 School reports & analytics\n\n` +
    `*All through WhatsApp — no app needed!*\n\n` +
    `Let me show you how it works! 🎯`
  );

  await delay(1500);
  await showDemoMainMenu(phone, session, wa);
}

// ============================================================
// MAIN DEMO MENU
// ============================================================

async function showDemoMainMenu(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_MENU';
  await saveMarketingSession(session);

  await wa.list(
    phone,
    `🏫 SchoolBot Demo`,
    `What would you like to explore?`,
    `Powered by SchoolBot · XtopEdu`,
    `🎯 Explore Features`,
    [
      {
        title: '🔥 Most Popular',
        rows: [
          {
            id:          'demo_attendance',
            title:       '✅ Attendance System',
            description: 'Real-time alerts to parents',
          },
          {
            id:          'demo_fees',
            title:       '💰 Fee Collection',
            description: 'Online payments & tracking',
          },
        ],
      },
      {
        title: '📱 More Features',
        rows: [
          {
            id:          'demo_pickup',
            title:       '🚗 Pickup Management',
            description: 'Authorized contacts & alerts',
          },
          {
            id:          'demo_reports',
            title:       '📊 School Reports',
            description: 'Analytics & insights',
          },
        ],
      },
      {
        title: '💼 Get Started',
        rows: [
          {
            id:          'see_pricing',
            title:       '💵 See Pricing',
            description: 'One-time setup fee only',
          },
          {
            id:          'register_now',
            title:       '🚀 Register Now',
            description: 'Get started today',
          },
          {
            id:          'talk_to_us',
            title:       '📞 Talk to Us',
            description: 'Speak with our team',
          },
        ],
      },
    ]
  );
}

// ============================================================
// ATTENDANCE DEMO
// ============================================================

async function showAttendanceDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_ATTENDANCE';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'attendance_demo'
  );

  await wa.text(
    phone,
    `✅ *Attendance Management Demo*\n\n` +
    `📍 Demo School: *${DEMO_SCHOOL.name}*\n\n` +
    `Here's what happened today:\n\n` +
    `📅 *${DEMO_ATTENDANCE.today.date}*\n\n` +
    `✅ Present: *${DEMO_ATTENDANCE.today.present}* students\n` +
    `❌ Absent:  *${DEMO_ATTENDANCE.today.absent}* students\n` +
    `⏰ Late:    *${DEMO_ATTENDANCE.today.late}* students\n` +
    `📊 Rate:    *${DEMO_ATTENDANCE.today.rate}*\n\n` +
    `When teacher marks a student, parent\n` +
    `gets this WhatsApp message *instantly* 👇`
  );

  await delay(2000);

  await wa.text(
    phone,
    `─────────────────────────\n` +
    `📱 *Sample Parent Message:*\n\n` +
    DEMO_ATTENDANCE.parentMessage +
    `\n─────────────────────────\n\n` +
    `🔥 *Results at ${DEMO_SCHOOL.name}:*\n` +
    `• ${DEMO_SCHOOL.parents} parents notified < 2 mins\n` +
    `• 98.4% message delivery rate\n` +
    `• Absences reduced by 67%!`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Want to see more? 👀`,
    [
      { id: 'att_parent_view', title: '👨‍👩‍👧 Parent View' },
      { id: 'att_admin_view',  title: '👨‍💼 Admin View' },
      { id: 'demo_fees',       title: '💰 Fees Demo' },
    ],
    'Attendance Demo'
  );
}

// ─── Parent attendance view ───────────────────────────────
async function showParentAttView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_ATTENDANCE_PARENT';
  await saveMarketingSession(session);

  const s = DEMO_ATTENDANCE.student;

  await wa.text(
    phone,
    `👨‍👩‍👧 *What Parent Sees on WhatsApp:*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📅 *Today's Attendance*\n` +
    `👤 ${s.name}\n` +
    `🏫 ${s.class}\n` +
    `📌 Status: ✅ Present\n` +
    `⏰ Arrival: ${s.arrivalTime}\n\n` +
    `📊 *Term Summary:*\n` +
    `Rate: *${s.termRate}*\n` +
    `✅ Present: ${s.present} days\n` +
    `❌ Absent:  ${s.absent} days\n` +
    `⏰ Late:    ${s.late} days\n` +
    `📅 Total:   ${s.total} days\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Parent checks this anytime by\n` +
    `just sending a message! 📱`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Impressive right? 😊`,
    [
      { id: 'demo_fees',    title: '💰 Fee Collection' },
      { id: 'demo_pickup',  title: '🚗 Pickup' },
      { id: 'see_pricing',  title: '💵 Pricing' },
    ]
  );
}

// ─── Admin attendance view ────────────────────────────────
async function showAdminAttView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_ATTENDANCE_ADMIN';
  await saveMarketingSession(session);

  await wa.text(
    phone,
    `👨‍💼 *How Teachers Mark Attendance:*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣ Teacher selects their class\n` +
    `2️⃣ Bot shows each student\n` +
    `3️⃣ Teacher taps Present/Absent/Late\n` +
    `4️⃣ Parent gets WhatsApp alert! 📱\n\n` +
    `⚡ *Mark 40 students in 3 minutes!*\n\n` +
    `📊 *Admin Dashboard shows:*\n` +
    `• Real-time attendance by class\n` +
    `• Students absent 3+ days in a row\n` +
    `• Term attendance rates\n` +
    `• Parent notification status`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `This reduced absences by *67%*! 🎯`,
    [
      { id: 'demo_fees',    title: '💰 Fee Collection' },
      { id: 'register_now', title: '🚀 Get Started' },
      { id: 'see_pricing',  title: '💵 Pricing' },
    ]
  );
}

// ============================================================
// FEES DEMO
// ============================================================

async function showFeesDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_FEES';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'fees_demo'
  );

  await wa.text(
    phone,
    `💰 *Fee Collection Demo*\n\n` +
    `📍 Demo: *${DEMO_SCHOOL.name}*\n\n` +
    `*Before SchoolBot:*\n` +
    `😫 Chasing parents for fees\n` +
    `📝 Manual payment records\n` +
    `❓ Not knowing who has paid\n` +
    `🏃 Parents coming to school\n\n` +
    `*After SchoolBot:*\n` +
    `✅ Parents pay online via WhatsApp\n` +
    `✅ Automatic payment reminders\n` +
    `✅ Real-time collection dashboard\n` +
    `✅ School gets *100%* of their fee!\n\n` +
    `📊 *${DEMO_SCHOOL.name} Results:*\n` +
    `• Collection: 58% → *91%* in 3 months!\n` +
    `• Outstanding reduced by *₦12.7 million*`
  );

  await delay(2000);

  await wa.buttons(
    phone,
    `Want to see parent & admin views? 👀`,
    [
      { id: 'fees_parent_view',  title: '👨‍👩‍👧 Parent View' },
      { id: 'fees_payment_demo', title: '💳 Payment Flow' },
      { id: 'demo_pickup',       title: '🚗 Pickup Demo' },
    ],
    'Fee Collection Demo'
  );
}

// ─── Parent fees view ─────────────────────────────────────
async function showParentFeesView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_FEES_PARENT';
  await saveMarketingSession(session);

  const inv1 = DEMO_FEES.invoices[0];
  const inv2 = DEMO_FEES.invoices[1];

  await wa.text(
    phone,
    `👨‍👩‍👧 *Parent Fee View (WhatsApp)*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Parent sends "fees" on WhatsApp:\n\n` +
    `💰 *Outstanding Fees*\n` +
    `👤 ${DEMO_FEES.student} • ${DEMO_FEES.class}\n\n` +
    `1. *${inv1.title}*\n` +
    `   💵 ${fmt(inv1.balance)} remaining\n` +
    `   📅 Due: 31 Dec 2024\n\n` +
    `2. *${inv2.title}*\n` +
    `   💵 ${fmt(inv2.balance)}\n` +
    `   📅 Due: 30 Nov 2024\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Total: ${fmt(DEMO_FEES.totalOutstanding)}*\n\n` +
    `Parent taps *Pay Now* → Paystack\n` +
    `link → Pays online! ✅`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Simple for parents, powerful for schools! 💪`,
    [
      { id: 'fees_payment_demo', title: '💳 See Payment' },
      { id: 'demo_pickup',       title: '🚗 Pickup Demo' },
      { id: 'register_now',      title: '🚀 Get Started' },
    ]
  );
}

// ─── Payment flow demo ────────────────────────────────────
async function showPaymentDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_FEES_PAYMENT';
  await saveMarketingSession(session);

  await wa.text(
    phone,
    `💳 *Payment Flow Demo*\n\n` +
    `When parent taps *Pay Now*:\n\n` +
    `📋 *Payment Summary*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 Chidi Okonkwo\n` +
    `📋 First Term Fees 2024/2025\n\n` +
    `💵 School Fee:     *${fmt(75000)}*\n` +
    `🏷️ Platform Fee:   *${fmt(1125)}* (1.5%)\n` +
    `🏦 Processing Fee: *${fmt(1178)}*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💳 *Total: ${fmt(77303)}*\n\n` +
    `🏫 School receives *${fmt(75000)}* (100%)\n\n` +
    `Pay via:\n` +
    `💳 Card | 🏦 Transfer\n` +
    `📱 USSD | 💵 Mobile Money\n\n` +
    `*School gets 100% —\n` +
    `we add our small fee on top!* 💪`
  );

  await delay(2000);

  await wa.buttons(
    phone,
    `Ready to collect fees online? 🚀`,
    [
      { id: 'register_now', title: '🚀 Register Now' },
      { id: 'see_pricing',  title: '💵 See Pricing' },
      { id: 'demo_pickup',  title: '🚗 Pickup Demo' },
    ]
  );
}

// ============================================================
// PICKUP DEMO
// ============================================================

async function showPickupDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_PICKUP';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'pickup_demo'
  );

  await wa.text(
    phone,
    `🚗 *Student Pickup Management*\n\n` +
    `Keep students safe with authorized\n` +
    `pickup contacts!\n\n` +
    `*${DEMO_PICKUP.student}'s Contacts:*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    DEMO_PICKUP.contacts.map((c, i) =>
      `${i + 1}. *${c.name}*\n` +
      `   👥 ${c.relationship}\n` +
      `   📱 ${c.phone}`
    ).join('\n\n') +
    `\n━━━━━━━━━━━━━━━━\n\n` +
    `When child is picked up:\n` +
    `1️⃣ Guard verifies contact\n` +
    `2️⃣ Logs pickup in SchoolBot\n` +
    `3️⃣ Parent gets WhatsApp alert! 📱`
  );

  await delay(2000);

  await wa.text(
    phone,
    `📱 *Parent receives instantly:*\n\n` +
    `🚗 *Pickup Notification*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ *${DEMO_PICKUP.student}* has been\n` +
    `picked up from school!\n\n` +
    `👤 By: ${DEMO_PICKUP.recentPickup.pickedBy}\n` +
    `⏰ Time: ${DEMO_PICKUP.recentPickup.time}\n\n` +
    `⚠️ If you did not authorize this,\n` +
    `contact school immediately!\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🔐 *Every pickup logged & verified!*`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Parents love this for child safety! 🔐`,
    [
      { id: 'demo_reports', title: '📊 Reports Demo' },
      { id: 'see_pricing',  title: '💵 Pricing' },
      { id: 'register_now', title: '🚀 Register Now' },
    ]
  );
}

// ============================================================
// REPORTS DEMO
// ============================================================

async function showReportsDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_REPORTS';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'reports_demo'
  );

  const r = DEMO_REPORTS;

  await wa.text(
    phone,
    `📊 *School Reports & Analytics*\n\n` +
    `*${DEMO_SCHOOL.name}* Dashboard:\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ *Attendance:*\n` +
    `This Week:  *${r.attendance.thisWeek}*\n` +
    `This Month: *${r.attendance.thisMonth}*\n` +
    `This Term:  *${r.attendance.thisTerm}*\n` +
    `Best Class: *${r.attendance.bestClass}*\n\n` +
    `💰 *Fee Collection:*\n` +
    `Collected:   *${fmt(r.feeCollection.totalCollected)}*\n` +
    `Outstanding: *${fmt(r.feeCollection.outstanding)}*\n` +
    `Rate:        *${r.feeCollection.collectionRate}*\n\n` +
    `📱 *WhatsApp Activity:*\n` +
    `Messages:  *${r.whatsappStats.messagesSent.toLocaleString()}*\n` +
    `Delivery:  *${r.whatsappStats.deliveryRate}*\n` +
    `Parents:   *${r.whatsappStats.parentsEngaged}*\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Make better decisions with real data! 📈`,
    [
      { id: 'register_now', title: '🚀 Register Now' },
      { id: 'see_pricing',  title: '💵 See Plans' },
      { id: 'talk_to_us',   title: '📞 Talk to Us' },
    ]
  );
}

// ============================================================
// PRICING
// ============================================================

async function showPricing(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_PRICING';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'pricing'
  );

  await wa.text(
    phone,
    `💵 *SchoolBot Pricing*\n\n` +
    `*How it works:*\n\n` +
    `1️⃣ *One-Time Setup Fee*\n` +
    `   Based on your student count\n` +
    `   Pay once — use forever!\n\n` +
    `2️⃣ *1.5% Commission Per Payment*\n` +
    `   Only when parents pay fees\n` +
    `   Added on TOP of school fee\n` +
    `   Your school gets *100%*! 💪\n\n` +
    `✅ *No monthly subscription!*\n` +
    `✅ *No hidden charges!*\n` +
    `✅ *Lifetime access!* 🎉`
  );

  await delay(1000);

  await wa.list(
    phone,
    `💵 Setup Fee Tiers`,
    `One-time setup fee based on\nyour student count:`,
    `Commission: 1.5% per payment (charged to parent)`,
    `📋 View Tiers`,
    [
      {
        title: 'Setup Fee Tiers',
        rows: SETUP_FEE_TIERS.map((t) => ({
          id:          `tier_${t.name.toLowerCase()}`,
          title:       `${t.name}: ${t.fee}`,
          description: t.range,
        })),
      },
    ]
  );

  await delay(1000);

  await wa.buttons(
    phone,
    `Ready to get started? 🚀`,
    [
      { id: 'register_now', title: '🚀 Register Now' },
      { id: 'talk_to_us',   title: '📞 Ask Questions' },
      { id: 'main_menu',    title: '↩️ See More' },
    ]
  );
}

// ============================================================
// REGISTRATION
// ============================================================

async function startRegistration(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'REGISTERING';
  await saveMarketingSession(session);
  await logDemoInteraction(
    formatPhone(phone), 'registration_started'
  );

  const prefill = {
    contactName:       session.contactName  ?? undefined,
    schoolName:        session.schoolName   ?? undefined,
    location:          session.location     ?? undefined,
    studentCountRange: session.studentCount ?? undefined,
    schoolType:        session.schoolType   ?? undefined,
  };

  // ✅ await so session is in DB before user replies
  const obSession = await startOnboardingSession(
    phone, 'marketing', prefill
  );

  console.log(
    `[Marketing] ✅ Onboarding started | ` +
    `step: ${obSession.step}`
  );

  if (session.contactName && session.schoolName) {
    await wa.text(
      phone,
      `🚀 *Let's register your school!*\n\n` +
      `I already have some details:\n\n` +
      `👤 *Name:* ${session.contactName}\n` +
      `🏫 *School:* ${session.schoolName}\n\n` +
      `Let me calculate your setup fee...`
    );
    await delay(1000);
    await showSetupFeeInfo(phone, obSession, wa);
  } else if (session.contactName) {
    await wa.text(
      phone,
      `🚀 *Register Your School!*\n\n` +
      `Hi *${
        session.contactName.split(' ')[0]
      }!* 👋\n\n` +
      `What is the name of your school?`
    );
  } else {
    await wa.text(
      phone,
      `🚀 *Register Your School!*\n\n` +
      `Let's get you set up! 😊\n\n` +
      `First, what is your *full name*?`
    );
  }
}

// ============================================================
// NOT INTERESTED
// ============================================================

async function handleNotInterested(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'NOT_INTERESTED';
  await saveMarketingSession(session);

  const response = await ai.chat(
    [{
      role:    'user',
      content: `I'm not sure I'm interested right now`,
    }],
    {
      contactName: session.contactName ?? null,
      schoolName:  session.schoolName  ?? null,
      intent:      'not_interested',
    }
  );

  await wa.text(phone, response);
  await delay(1500);

  await wa.buttons(
    phone,
    `No problem! We're here whenever\nyou're ready 😊`,
    [
      { id: 'see_pricing', title: '💵 See Pricing' },
      { id: 'main_menu',   title: '🎯 See Features' },
      { id: 'talk_to_us',  title: '📞 Contact Us' },
    ]
  );
}

// ============================================================
// CONTACT OPTIONS
// ============================================================

async function showContactOptions(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_CONTACT';
  await saveMarketingSession(session);

  const adminPhone =
    Deno.env.get('SUPER_ADMIN_PHONE') ?? '';

  await wa.buttons(
    phone,
    `📞 *Talk to Our Team*\n\n` +
    `We'd love to answer your questions!\n\n` +
    `📱 WhatsApp: *${adminPhone}*\n` +
    `⏰ Available: Mon-Fri, 8AM-6PM`,
    [
      { id: 'register_now', title: '🚀 Register Instead' },
      { id: 'main_menu',    title: '🎯 See More Features' },
    ],
    'Contact Us'
  );
}

// ============================================================
// QUICK OPTIONS
// ============================================================

async function showQuickOptions(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `What would you like to do next?`,
    [
      { id: 'register_now', title: '🚀 Register Now' },
      { id: 'main_menu',    title: '🎯 See Features' },
      { id: 'see_pricing',  title: '💵 Pricing' },
    ]
  );
}
