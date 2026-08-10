// ============================================================
// SCHOOLBOT - MARKETING BOT HANDLER
// _shared/bot/marketing/marketing.handler.ts
//
// Handles ALL unknown users on YOUR platform number.
// This is the sales/demo/onboarding bot.
// Moved from marketing-webhook into shared so ONE webhook
// handles everything.
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { getSupabase } from '../../supabase.ts';
import { AIService } from '../../ai.service.ts';
import { delay, formatPhone } from '../../utils.ts';
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
import type { IncomingMessage } from '../../types.ts';

const db  = getSupabase();
const ai  = new AIService();

// ─── Demo session type ────────────────────────────────────
type DemoSession = {
  phone:         string;
  contactName:   string | null;
  schoolName:    string | null;
  schoolType:    string | null;
  location:      string | null;
  studentCount:  string | null;
  email:         string | null;
  state:         string;
  aiHistory:     Array<{ role: string; content: string }>;
  registered:    boolean;
  lastActivity:  number;
};

// In-memory demo sessions (short-lived, 12 hours)
const demoSessions = new Map<string, DemoSession>();
const SESSION_TTL  = 12 * 60 * 60 * 1000;

const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start', 'menu',
]);

// Currency formatter
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

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
// Called from handler.ts for unknown users on platform number
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

  // ── Active onboarding session ───────────────────────────
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, 'marketing'
    );
    if (handled) return;
  }

  // ── Get or create demo session ──────────────────────────
  let session = getSession(phone);

  // Reset keywords or new user
  if (!input || RESET_KEYWORDS.has(input) || !session) {
    session = createSession(phone);
    await sendWelcome(phone, session, wa);
    return;
  }

  session.lastActivity = Date.now();
  demoSessions.set(formatPhone(phone), session);

  // ── Registration triggers ───────────────────────────────
  if ([
    'register_now',
    'start_onboarding',
    'start_trial',
  ].includes(input)) {
    await startRegistration(phone, session, wa);
    return;
  }

  // ── Button / list selections ────────────────────────────
  if (buttonId || listId) {
    await handleMenuSelection(phone, session, input, wa);
    return;
  }

  // ── Text input ──────────────────────────────────────────
  await handleTextInput(phone, session, rawText, input, wa);
}

// ─── Handle menu selections ───────────────────────────────
async function handleMenuSelection(
  phone: string,
  session: DemoSession,
  input: string,
  wa: WhatsApp
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
      await showMainMenu(phone, session, wa);
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
    default:
      await handleAI(phone, session, input, wa);
  }
}

// ─── Handle text input ────────────────────────────────────
async function handleTextInput(
  phone: string,
  session: DemoSession,
  rawText: string,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (session.state === 'COLLECTING_NAME') {
    if (rawText.length >= 2) {
      session.contactName = rawText.trim();
      session.state       = 'DEMO_MENU';
      demoSessions.set(formatPhone(phone), session);
      await wa.text(
        phone,
        `Nice to meet you *${rawText.split(' ')[0]}!* 😊`
      );
      await delay(800);
      await showMainMenu(phone, session, wa);
    } else {
      await wa.text(phone, `Please enter your full name:`);
    }
    return;
  }

  // AI handles everything else
  await handleAI(phone, session, rawText, wa);
}

// ─── AI response handler ──────────────────────────────────
async function handleAI(
  phone: string,
  session: DemoSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  const history = session.aiHistory as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  history.push({ role: 'user', content: input });

  const { intent, entities } =
    await ai.detectIntent(input);

  if (entities.school_name && !session.schoolName) {
    session.schoolName = entities.school_name;
  }
  if (entities.location && !session.location) {
    session.location = entities.location;
  }

  const aiResponse = await ai.chat(history, {
    contactName: session.contactName,
    schoolName:  session.schoolName,
    registered:  session.registered,
    intent,
  });

  history.push({ role: 'assistant', content: aiResponse });
  session.aiHistory = history.slice(-20);
  demoSessions.set(formatPhone(phone), session);

  await wa.text(phone, aiResponse);
  await delay(1500);
  await handleIntentFollowUp(phone, session, intent, wa);
}

// ─── Follow up based on intent ────────────────────────────
async function handleIntentFollowUp(
  phone: string,
  session: DemoSession,
  intent: string,
  wa: WhatsApp
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
      await showMainMenu(phone, session, wa);
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

// ─── Welcome message ──────────────────────────────────────
async function sendWelcome(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `I'm *Sabi* — your SchoolBot assistant! 🤖\n\n` +
    `SchoolBot helps Nigerian schools manage:\n` +
    `✅ Student attendance (WhatsApp alerts)\n` +
    `💰 Fee collection & online payments\n` +
    `🚗 Student pickup management\n` +
    `📊 School reports & analytics\n\n` +
    `*All through WhatsApp — no app needed!*\n\n` +
    `Let me show you how it works! 🎯`
  );

  await delay(1500);
  await showMainMenu(phone, session, wa);
}

// ─── Main menu ────────────────────────────────────────────
async function showMainMenu(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  session.state = 'DEMO_MENU';
  demoSessions.set(formatPhone(phone), session);

  await wa.list(
    phone,
    `🏫 SchoolBot Demo`,
    `What would you like to explore?`,
    `Powered by SchoolBot`,
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

// ─── Attendance demo ──────────────────────────────────────
async function showAttendanceDemo(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'attendance_demo');

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
    `When teacher marks a student, the parent\n` +
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
      { id: 'demo_fees',       title: '💰 See Fees Demo' },
    ],
    'Attendance Demo'
  );
}

// ─── Parent attendance view ───────────────────────────────
async function showParentAttView(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
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
    `❌ Absent: ${s.absent} days\n` +
    `⏰ Late: ${s.late} days\n` +
    `📅 Total: ${s.total} days\n` +
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
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
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
    `This is how ${DEMO_SCHOOL.name} reduced\n` +
    `unexplained absences by *67%*! 🎯`,
    [
      { id: 'demo_fees',    title: '💰 Fee Collection' },
      { id: 'register_now', title: '🚀 Get Started' },
      { id: 'see_pricing',  title: '💵 Pricing' },
    ]
  );
}

// ─── Fees demo ────────────────────────────────────────────
async function showFeesDemo(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'fees_demo');

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
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
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

// ─── Payment demo ─────────────────────────────────────────
async function showPaymentDemo(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
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
    `Pay via: 💳 Card | 🏦 Transfer\n` +
    `📱 USSD | 💵 Mobile Money\n\n` +
    `*Your school gets 100% —\n` +
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

// ─── Pickup demo ──────────────────────────────────────────
async function showPickupDemo(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'pickup_demo');

  await wa.text(
    phone,
    `🚗 *Student Pickup Management*\n\n` +
    `Keep students safe with authorized\n` +
    `pickup contacts!\n\n` +
    `*${DEMO_PICKUP.student}'s Authorized Contacts:*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    DEMO_PICKUP.contacts.map((c, i) =>
      `${i + 1}. *${c.name}*\n` +
      `   👥 ${c.relationship}\n` +
      `   📱 ${c.phone}`
    ).join('\n\n') +
    `\n━━━━━━━━━━━━━━━━\n\n` +
    `When child is picked up:\n` +
    `1. Guard verifies contact\n` +
    `2. Logs pickup in SchoolBot\n` +
    `3. Parent gets WhatsApp alert! 📱`
  );

  await delay(2000);

  await wa.text(
    phone,
    `📱 *Parent receives instantly:*\n\n` +
    `🚗 *Pickup Notification*\n\n` +
    `✅ *${DEMO_PICKUP.student}* has been picked up!\n\n` +
    `👤 By: ${DEMO_PICKUP.recentPickup.pickedBy}\n` +
    `⏰ Time: ${DEMO_PICKUP.recentPickup.time}\n\n` +
    `If you did not authorize this,\n` +
    `contact school immediately!\n\n` +
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

// ─── Reports demo ─────────────────────────────────────────
async function showReportsDemo(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'reports_demo');
  const r = DEMO_REPORTS;

  await wa.text(
    phone,
    `📊 *School Reports & Analytics*\n\n` +
    `*${DEMO_SCHOOL.name}* Monthly Dashboard:\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ *Attendance:*\n` +
    `This Week:  *${r.attendance.thisWeek}*\n` +
    `This Month: *${r.attendance.thisMonth}*\n` +
    `This Term:  *${r.attendance.thisTerm}*\n` +
    `Best Class: *${r.attendance.bestClass}*\n\n` +
    `💰 *Fee Collection:*\n` +
    `Collected: *${fmt(r.feeCollection.totalCollected)}*\n` +
    `Outstanding: *${fmt(r.feeCollection.outstanding)}*\n` +
    `Rate: *${r.feeCollection.collectionRate}*\n\n` +
    `📱 *WhatsApp Activity:*\n` +
    `Messages Sent: *${r.whatsappStats.messagesSent.toLocaleString()}*\n` +
    `Delivery Rate: *${r.whatsappStats.deliveryRate}*\n` +
    `Parents Active: *${r.whatsappStats.parentsEngaged}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `All reports on web dashboard\n` +
    `& WhatsApp! 📱💻`
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

// ─── Pricing ──────────────────────────────────────────────
async function showPricing(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'pricing');

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
    `*No monthly subscription!\n` +
    `No hidden charges!* 🎉`
  );

  await delay(1000);

  await wa.list(
    phone,
    `💵 Setup Fee Tiers`,
    `One-time setup fee based on\nyour student count:`,
    `Commission: 1.5% per payment (on parent)`,
    `📋 View Tiers`,
    [
      {
        title: 'Setup Fee Tiers',
        rows: SETUP_FEE_TIERS.map((t) => ({
          id:          `TIER_${t.name.toUpperCase()}`,
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

// ─── Start registration ───────────────────────────────────
async function startRegistration(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  await logInteraction(phone, 'registration_started');

  const prefill = {
    contactName:       session.contactName ?? undefined,
    schoolName:        session.schoolName  ?? undefined,
    location:          session.location    ?? undefined,
    studentCountRange: session.studentCount ?? undefined,
    schoolType:        session.schoolType  ?? undefined,
  };

  const obSession = startOnboardingSession(
    phone, 'marketing', prefill
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
      `Hi *${session.contactName.split(' ')[0]}!* 👋\n\n` +
      `What is the name of your school?`
    );
  } else {
    await wa.text(
      phone,
      `🚀 *Register Your School!*\n\n` +
      `Let's get you set up!\n\n` +
      `What is your *full name*?`
    );
  }
}

// ─── Not interested ───────────────────────────────────────
async function handleNotInterested(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
  const response = await ai.chat(
    [{ role: 'user', content: `I'm not sure I'm interested` }],
    {
      contactName: session.contactName,
      schoolName:  session.schoolName,
      intent:      'not_interested',
    }
  );

  await wa.text(phone, response);
  await delay(1500);

  await wa.buttons(
    phone,
    `No problem! We're here whenever\nyou're ready 😊`,
    [
      { id: 'see_pricing',  title: '💵 See Pricing' },
      { id: 'main_menu',    title: '🎯 See Features' },
      { id: 'talk_to_us',   title: '📞 Contact Us' },
    ]
  );
}

// ─── Contact options ──────────────────────────────────────
async function showContactOptions(
  phone: string,
  session: DemoSession,
  wa: WhatsApp
): Promise<void> {
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

// ─── Quick options ────────────────────────────────────────
async function showQuickOptions(
  phone: string,
  wa: WhatsApp
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

// ─── Session helpers ──────────────────────────────────────
function getSession(phone: string): DemoSession | null {
  const key = formatPhone(phone);
  const s   = demoSessions.get(key);
  if (!s) return null;
  if (Date.now() - s.lastActivity > SESSION_TTL) {
    demoSessions.delete(key);
    return null;
  }
  return s;
}

function createSession(phone: string): DemoSession {
  const key = formatPhone(phone);
  const s: DemoSession = {
    phone:        key,
    contactName:  null,
    schoolName:   null,
    schoolType:   null,
    location:     null,
    studentCount: null,
    email:        null,
    state:        'WELCOME',
    aiHistory:    [],
    registered:   false,
    lastActivity: Date.now(),
  };
  demoSessions.set(key, s);
  return s;
}

// ─── Log interaction ──────────────────────────────────────
async function logInteraction(
  phone: string,
  feature: string
): Promise<void> {
  try {
    const { data: session } = await db
      .from('demo_sessions')
      .select('id')
      .eq('phone', formatPhone(phone))
      .single();

    if (session?.id) {
      await db.from('demo_interactions').insert({
        session_id:  session.id,
        feature,
        created_at:  new Date().toISOString(),
      });
    }
  } catch { /* non critical */ }
}
