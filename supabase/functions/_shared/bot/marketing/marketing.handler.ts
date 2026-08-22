// ============================================================
// SCHOOLBOT - MARKETING BOT & LIVE SANDBOX HANDLER
// _shared/bot/marketing/marketing.handler.ts
// ✅ Added: Comprehensive FAQ & Full Features List
// ✅ Interactive Live Attendance Marking (with simulated parent alert)
// ✅ Real on-the-fly Result Card PDF generation (A4 single-page design)
// ✅ Real on-the-fly Payment Receipt PDF generation
// ✅ Interactive Fee Split & 1.5% Commission Simulator
// ✅ Live Parent vs Admin View Toggle
// ✅ Conversational AI with Sabi + Direct Registration Flow
// ============================================================

import { WhatsApp }       from '../../whatsapp.ts';
import { AIService }      from '../../ai.service.ts';
import { getSupabase }    from '../../supabase.ts';
import { formatPhone, delay, fmt } from '../../utils.ts';
import { PdfService }     from '../../pdf.service.ts';
import {
  getOnboardingSession,
  handleOnboardingInput,
  startOnboardingSession,
  handleInvitationToken,
  showSetupFeeInfo,
} from '../../onboarding/engine.ts';
import {
  DEMO_SCHOOL,
  DEMO_STUDENTS,
  DEMO_RESULT_DATA,
  DEMO_FEES,
  DEMO_PICKUP,
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

const ai       = new AIService();
const db       = getSupabase();
const pdfSvc   = new PdfService();

const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start', 'menu', 'home', '00', 'restart',
]);

const TRIAL_CODE_REGEX =
  /^TRIAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

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
// MAIN MARKETING ENTRY POINT
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
      ? message.interactive?.button_reply?.id?.toLowerCase() ?? ''
      : '';

  const listId =
    message.type === 'interactive'
      ? message.interactive?.list_reply?.id?.toLowerCase() ?? ''
      : '';

  const input = buttonId || listId || rawText.toLowerCase().trim();

  console.log(
    `[Marketing] from=${phone} | input="${input.substring(0, 40)}" | raw="${rawText.substring(0, 40)}"`
  );

  // 1. Staff invitation token
  if (
    message.type === 'text' &&
    /^[A-Z0-9]{8}$/i.test(rawText.trim()) &&
    !TRIAL_CODE_REGEX.test(rawText.trim())
  ) {
    await handleInvitationToken(phone, rawText.trim().toUpperCase(), wa);
    return;
  }

  // 2. Free trial voucher code
  if (message.type === 'text' && TRIAL_CODE_REGEX.test(rawText.trim())) {
    await handleTrialCode(phone, rawText.trim().toUpperCase(), wa);
    return;
  }

  // 3. Active onboarding session
  const obSession = await getOnboardingSession(phone);
  if (obSession) {
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // 4. Marketing / Sandbox Session
  let session = await getMarketingSession(formatPhone(phone));
  if (!session) {
    session = await createMarketingSession(formatPhone(phone));
  }

  // Only trigger welcome if user sent an explicit reset keyword or empty input
  if (!input || RESET_KEYWORDS.has(input)) {
    await sendWelcome(phone, session, wa);
    return;
  }

  // 5. Registration shortcuts
  if (['register_now', 'start_onboarding', 'start_trial'].includes(input)) {
    await startRegistration(phone, session, wa);
    return;
  }

  if (input === 'manage_existing') {
    try {
      await db.from('demo_sessions').delete().eq('phone', formatPhone(phone));
    } catch { /* Non-critical */ }

    await wa.text(phone, `✅ Type *hi* to access your school admin panel!`);
    return;
  }

  // 6. Interactive Button / List dispatcher
  if (buttonId || listId) {
    await handleSandboxSelection(phone, session, input, wa);
    return;
  }

  // 7. Text input & conversational state router
  await handleTextInput(phone, session, rawText, input, wa);
}

// ============================================================
// WELCOME SCREEN
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
    `SchoolBot turns WhatsApp into a complete school management platform for Nigerian schools:\n\n` +
    `✅ *Attendance:* Teachers mark class in 2 mins, parents get instant WhatsApp alerts\n` +
    `💰 *Fee Collection:* Parents pay online via Paystack; school receives 100%\n` +
    `🎓 *Single-Page Result Sheets:* Generate & send beautiful A4 report cards directly to WhatsApp\n` +
    `🚗 *Pickup Security:* Verified pickup logs & safety alerts\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `*Explore features or view our FAQs below:* 👇`
  );

  await delay(1200);
  await showSandboxMainMenu(phone, session, wa);
}

// ============================================================
// MAIN SANDBOX HUB MENU (Max 10 rows)
// ============================================================

async function showSandboxMainMenu(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'SANDBOX_HUB';
  await saveMarketingSession(session);

  await wa.list(
    phone,
    `🏫 SchoolBot Hub`,
    `Explore features & answers for our demo school:\n*${DEMO_SCHOOL.name}*\n\nSelect an option below:`,
    `Powered by SchoolBot · XtopEdu`,
    `🎯 Main Menu`,
    [
      {
        title: '👨‍💼 Test Admin Features',
        rows: [
          {
            id:          'sandbox_mark_att',
            title:       '📝 Mark Attendance',
            description: 'Mark class & trigger parent alert',
          },
          {
            id:          'sandbox_result_pdf',
            title:       '🎓 Download Result PDF',
            description: 'Get sample single-page A4 result card',
          },
          {
            id:          'sandbox_receipt_pdf',
            title:       '🧾 Download Receipt PDF',
            description: 'Get sample branded official receipt',
          },
          {
            id:          'sandbox_fee_calc',
            title:       '💰 Fee Split Simulator',
            description: 'See how school receives 100% of fees',
          },
        ],
      },
      {
        title: '👨‍👩‍👧 Test Parent Features',
        rows: [
          {
            id:          'sandbox_parent_att',
            title:       '📅 Child Attendance',
            description: 'Check attendance & term summary',
          },
          {
            id:          'sandbox_parent_fees',
            title:       '💳 Pay School Fees',
            description: 'View outstanding balance & pay link',
          },
          {
            id:          'sandbox_parent_pickup',
            title:       '🚗 Pickup Security',
            description: 'See authorized contacts & pickup logs',
          },
        ],
      },
      {
        title: '💡 FAQs & Registration',
        rows: [
          {
            id:          'show_faq_menu',
            title:       '❓ FAQs & All Features',
            description: 'Everything SchoolBot can do + FAQs',
          },
          {
            id:          'see_pricing',
            title:       '💵 View Pricing',
            description: 'One-time setup fee tiers',
          },
          {
            id:          'register_now',
            title:       '🚀 Register My School',
            description: 'Set up your school in 5 minutes',
          },
        ],
      },
    ]
  );
}

// ============================================================
// SANDBOX INTERACTIVE ACTIONS
// ============================================================

async function handleSandboxSelection(
  phone:   string,
  session: DemoSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {

    // ── FAQ & Features Overview ───────────────────────────
    case 'show_faq_menu':
      await showFAQOverview(phone, session, wa);
      break;

    case 'faq_all_features':
      await showAllFeaturesList(phone, session, wa);
      break;

    case 'faq_general_questions':
      await showGeneralFAQ(phone, session, wa);
      break;

    case 'faq_fees_payments':
      await showFeesPaymentFAQ(phone, session, wa);
      break;

    // ── Admin: Live Attendance Marking ────────────────────
    case 'sandbox_mark_att':
      await startLiveAttendanceDemo(phone, session, wa);
      break;

    // ── Admin: Download Real Result PDF ───────────────────
    case 'sandbox_result_pdf':
      await generateAndSendDemoResultPdf(phone, session, wa);
      break;

    // ── Admin: Download Real Receipt PDF ──────────────────
    case 'sandbox_receipt_pdf':
      await generateAndSendDemoReceiptPdf(phone, session, wa);
      break;

    // ── Admin: Fee Split Simulator ────────────────────────
    case 'sandbox_fee_calc':
      await promptFeeSimulator(phone, session, wa);
      break;

    // ── Parent: Live Parent Views ─────────────────────────
    case 'sandbox_parent_att':
      await showParentAttendanceView(phone, session, wa);
      break;

    case 'sandbox_parent_fees':
      await showParentFeesView(phone, session, wa);
      break;

    case 'sandbox_parent_pickup':
      await showParentPickupView(phone, session, wa);
      break;

    // ── Pricing & Registration ────────────────────────────
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
      await showSandboxMainMenu(phone, session, wa);
      break;

    default:
      if (input.startsWith('mark_demo_')) {
        await handleLiveMarkingAction(phone, session, input, wa);
      } else if (input.startsWith('calc_preset_')) {
        const amt = parseFloat(input.replace('calc_preset_', ''));
        await calculateAndShowFeeSplit(phone, session, amt, wa);
      } else if (input.startsWith('tier_')) {
        await startRegistration(phone, session, wa);
      } else {
        await handleAI(phone, session, input, wa);
      }
  }
}

// ============================================================
// 💡 FAQ & ALL FEATURES SECTION
// ============================================================

async function showFAQOverview(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'FAQ_HUB';
  await saveMarketingSession(session);
  await logDemoInteraction(formatPhone(phone), 'faq_view');

  await wa.buttons(
    phone,
    `❓ *Frequently Asked Questions & Features*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `SchoolBot turns standard WhatsApp into an all-in-one management portal for Nigerian schools.\n\n` +
    `What would you like to explore?`,
    [
      { id: 'faq_all_features',      title: '📋 All Features List' },
      { id: 'faq_general_questions', title: '❓ General FAQs'       },
      { id: 'faq_fees_payments',     title: '💰 Fees & Paystack FAQ'},
    ]
  );
}

async function showAllFeaturesList(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'all_features_list');

  await wa.text(
    phone,
    `🌟 *COMPLETE SCHOOLBOT FEATURES LIST*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `1️⃣ *ACADEMICS & DAILY ATTENDANCE:*\n` +
    `• Mark 40 students in 2 minutes via WhatsApp buttons\n` +
    `• Instant automated parent alerts (Present, Absent, Late)\n` +
    `• Real-time class attendance rate & absence analytics\n` +
    `• Term-wide summary & consecutive absence tracking\n\n` +
    `2️⃣ *FINANCE & ONLINE FEE COLLECTION:*\n` +
    `• Bill tuition, uniform, textbooks, PTA, sports, & custom fees\n` +
    `• Direct settlement to school bank account via Paystack\n` +
    `• *100% tuition received* (1.5% fee covered by parent)\n` +
    `• Instant official branded PDF receipts sent to WhatsApp\n` +
    `• Automated WhatsApp fee reminders for debtors\n` +
    `• Cash / Bank Transfer manual payment recording\n\n` +
    `3️⃣ *SINGLE-PAGE A4 RESULT SHEETS:*\n` +
    `• Beautiful A4 result sheets tailored for Nigerian schools\n` +
    `• Subject CA (1st & 2nd) + Exam + Grade + Remarks\n` +
    `• Affective traits rating (Punctuality, Neatness, Honesty, etc.)\n` +
    `• Next term fees breakdown & resumption dates\n` +
    `• School logo, official stamp & Principal signature embedded\n\n` +
    `4️⃣ *STUDENT PICKUP & CHILD SAFETY:*\n` +
    `• Register authorized guardians with photos & phone numbers\n` +
    `• Instant WhatsApp alert whenever a child is dismissed\n` +
    `• Gatekeeper verification logs\n\n` +
    `5️⃣ *ADMIN & STAFF MANAGEMENT:*\n` +
    `• Add teachers & bursars via simple 8-digit invite codes\n` +
    `• Broadcast messages to all parents or specific classes\n` +
    `• Fast bulk CSV importer (1,500+ students in 30 seconds)\n` +
    `• Multi-school support for proprietors with multiple branches\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Ready to test these features live or register?`,
    [
      { id: 'main_menu',    title: '🎯 Test Features'  },
      { id: 'see_pricing',  title: '💵 View Pricing'   },
      { id: 'register_now', title: '🚀 Register School' },
    ]
  );
}

async function showGeneralFAQ(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'general_faq');

  await wa.text(
    phone,
    `❓ *GENERAL FREQUENTLY ASKED QUESTIONS*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📌 *Q1: Do parents or teachers need to download a new app?*\n` +
    `👉 *A:* No! Everything works 100% inside regular WhatsApp. Parents, teachers, and admins never need to install anything.\n\n` +
    `📌 *Q2: Can we customize result sheets and receipts with our school logo?*\n` +
    `👉 *A:* Yes! Upload your school logo, motto, address, stamp, and principal's signature. All PDFs are automatically branded with your school identity.\n\n` +
    `📌 *Q3: What if we have hundreds or thousands of students?*\n` +
    `👉 *A:* You can upload your whole student population in one click using our fast CSV spreadsheet template. 1,500 students import in under 30 seconds.\n\n` +
    `📌 *Q4: Are there monthly subscription fees?*\n` +
    `👉 *A:* No monthly subscription! You only pay a one-time setup fee based on student population. You get lifetime access to the platform.\n\n` +
    `📌 *Q5: Can teachers access student fee balances or admin financial reports?*\n` +
    `👉 *A:* No. Teacher accounts only have access to mark attendance and manage academic scores. Financial reports are restricted to Administrators and Proprietors.\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Have more questions or want to see pricing?`,
    [
      { id: 'faq_fees_payments', title: '💰 Fees & Pay FAQ'  },
      { id: 'talk_to_us',        title: '📞 Speak With Us'   },
      { id: 'register_now',      title: '🚀 Register School' },
    ]
  );
}

async function showFeesPaymentFAQ(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'fees_faq');

  await wa.text(
    phone,
    `💰 *FEES & PAYMENT FAQS*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📌 *Q1: How does the school receive fee payments?*\n` +
    `👉 *A:* Payments are processed through Paystack and settled directly into your registered Nigerian school bank account (Access, GTBank, Zenith, First Bank, etc.).\n\n` +
    `📌 *Q2: How does the 1.5% platform fee work?*\n` +
    `👉 *A:* The 1.5% platform fee is added on *top* of the parent's invoice. For example, if school fee is ₦50,000, parent pays ₦50,750 (+ gateway fee), and your school receives the full ₦50,000 (100%).\n\n` +
    `📌 *Q3: Can we still record manual cash or direct bank transfers?*\n` +
    `👉 *A:* Yes! Admins can search any student, record Cash/Transfer/POS payments, and the bot immediately issues an official PDF receipt to the parent on WhatsApp.\n\n` +
    `📌 *Q4: Can we bill custom items like Uniforms, Books, and Excursions?*\n` +
    `👉 *A:* Yes! You can create any custom fee structure and bill an entire class, an arm, or a single student with customized due dates.\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Ready to get started?`,
    [
      { id: 'sandbox_fee_calc', title: '💰 Fee Simulator'   },
      { id: 'see_pricing',      title: '💵 View Pricing'    },
      { id: 'register_now',     title: '🚀 Register School' },
    ]
  );
}

// ============================================================
// 1. LIVE ATTENDANCE DEMO (Interactive)
// ============================================================

async function startLiveAttendanceDemo(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'SANDBOX_ATTENDANCE';
  await saveMarketingSession(session);
  await logDemoInteraction(formatPhone(phone), 'live_attendance_demo');

  const student = DEMO_STUDENTS[0]; // Chidi Okonkwo

  await wa.buttons(
    phone,
    `📝 *Live Attendance Marking Demo*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 School: *${DEMO_SCHOOL.name}*\n` +
    `📚 Class: *JSS 3A*\n` +
    `👤 Student: *${student.name}*\n` +
    `📋 Adm No: *${student.admNo}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Tap a button to mark this student and see the *instant WhatsApp alert* the parent gets:`,
    [
      { id: `MARK_DEMO_PRESENT_${student.id}`, title: '✅ Present' },
      { id: `MARK_DEMO_ABSENT_${student.id}`,  title: '❌ Absent'  },
      { id: `MARK_DEMO_LATE_${student.id}`,    title: '⏰ Late'    },
    ]
  );
}

async function handleLiveMarkingAction(
  phone:   string,
  session: DemoSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const parts  = input.split('_');
  const status = parts[2]?.toLowerCase() ?? 'present';
  const student = DEMO_STUDENTS[0];

  await wa.text(
    phone,
    `✅ *Student Marked!* (${status.toUpperCase()})\n\n` +
    `⚡ Within 2 seconds, SchoolBot sends this alert to the parent's phone 👇`
  );

  await delay(1200);

  const statusEmojis: Record<string, string> = {
    present: '✅ *Present*',
    absent:  '❌ *Absent*',
    late:    '⏰ *Late (Arrived: 08:12 AM)*',
  };

  const statusDetails: Record<string, string> = {
    present: 'Arrival Time: 07:45 AM',
    absent:  '⚠️ If this is unexpected, please contact the school office immediately.',
    late:    'Arrival Time: 08:12 AM (Assembly Missed)',
  };

  await wa.text(
    phone,
    `─────────────────────────\n` +
    `📱 *Simulated Message Sent to Parent:*\n\n` +
    `🔔 *Attendance Notification*\n\n` +
    `Dear Parent,\n` +
    `*${student.name}* has been marked ${statusEmojis[status] ?? status} today.\n\n` +
    `🏫 School: ${DEMO_SCHOOL.name}\n` +
    `📚 Class: ${student.class}${student.arm}\n` +
    `📅 Date: ${new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n` +
    `${statusDetails[status]}\n\n` +
    `_Powered by SchoolBot_\n` +
    `─────────────────────────`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Parents love this transparency! Ready to test another feature?`,
    [
      { id: 'sandbox_result_pdf', title: '🎓 See Result PDF'  },
      { id: 'sandbox_fee_calc',   title: '💰 Fee Simulator'   },
      { id: 'register_now',       title: '🚀 Register School' },
    ]
  );
}

// ============================================================
// 2. LIVE RESULT CARD PDF GENERATOR
// ============================================================

async function generateAndSendDemoResultPdf(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'demo_result_pdf');

  await wa.text(
    phone,
    `⏳ *Building sample single-page A4 Result Card...*\n\n` +
    `Applying school branding, academic performance table, affective traits rating, grading keys, and principal signature...`
  );

  try {
    const pdfUrl = await pdfSvc.buildResultPdf(DEMO_RESULT_DATA);

    await wa.document(
      phone,
      pdfUrl,
      `Greenfield-Academy-Result-${DEMO_STUDENTS[0].admNo.replace(/\//g, '-')}.pdf`,
      `🎓 Here is the live-generated A4 Result Sheet for ${DEMO_STUDENTS[0].name}!`
    );

    await delay(1500);

    await wa.buttons(
      phone,
      `Fits on a single A4 sheet! What would you like to see next?`,
      [
        { id: 'sandbox_receipt_pdf', title: '🧾 See Receipt PDF' },
        { id: 'sandbox_fee_calc',    title: '💰 Fee Split Calc'  },
        { id: 'register_now',        title: '🚀 Register School' },
      ]
    );
  } catch (err) {
    console.error('[Marketing] Result PDF build error:', err);
    await wa.text(phone, `❌ Could not generate sample PDF. Please try again.`);
  }
}

// ============================================================
// 3. LIVE PAYMENT RECEIPT PDF GENERATOR
// ============================================================

async function generateAndSendDemoReceiptPdf(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'demo_receipt_pdf');

  await wa.text(
    phone,
    `⏳ *Generating sample branded Fee Receipt...*\n\n` +
    `Applying payment details, transaction reference, amount in words, and official school stamp...`
  );

  try {
    const pdfUrl = await pdfSvc.buildReceiptPdf({
      receiptNumber:   'GA-RCP-2025-0842',
      schoolName:      DEMO_SCHOOL.name,
      schoolAddress:   DEMO_SCHOOL.address,
      schoolPhone:     DEMO_SCHOOL.phone,
      studentName:     DEMO_STUDENTS[0].name,
      admissionNumber: DEMO_STUDENTS[0].admNo,
      className:       'JSS 3A',
      feeTitle:        'Second Term School Fees 2024/2025',
      term:            'Second Term',
      academicYear:    '2024/2025',
      amount:          75000,
      paymentMethod:   'Paystack Online (Card)',
      reference:       'PAYSTACK-GA-94827103',
      paymentDate:     new Date().toISOString(),
      issuedTo:        'Mr. & Mrs. Okonkwo',
      schoolId:        DEMO_SCHOOL.id,
    });

    await wa.document(
      phone,
      pdfUrl,
      `Receipt-GA-2025-0842.pdf`,
      `🧾 Here is the official fee receipt for ${DEMO_STUDENTS[0].name}!`
    );

    await delay(1500);

    await wa.buttons(
      phone,
      `Sent automatically whenever a parent pays! What's next?`,
      [
        { id: 'sandbox_fee_calc', title: '💰 Fee Split Calc'  },
        { id: 'sandbox_mark_att', title: '📝 Mark Attendance' },
        { id: 'register_now',     title: '🚀 Register School' },
      ]
    );
  } catch (err) {
    console.error('[Marketing] Receipt PDF build error:', err);
    await wa.text(phone, `❌ Could not generate sample receipt.`);
  }
}

// ============================================================
// 4. INTERACTIVE FEE SPLIT SIMULATOR
// ============================================================

async function promptFeeSimulator(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'SANDBOX_FEE_CALC';
  await saveMarketingSession(session);
  await logDemoInteraction(formatPhone(phone), 'fee_calc_simulator');

  await wa.buttons(
    phone,
    `💰 *SchoolBot Fee Split Simulator*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `*The Rule:* Your school receives *100%* of your fee!\n\n` +
    `We add a small 1.5% platform fee on top of the parent's payment.\n\n` +
    `Choose a sample school fee to calculate:`,
    [
      { id: 'CALC_PRESET_30000',  title: '₦30,000 Fee'  },
      { id: 'CALC_PRESET_75000',  title: '₦75,000 Fee'  },
      { id: 'CALC_PRESET_150000', title: '₦150,000 Fee' },
    ]
  );

  await delay(600);
  await wa.text(
    phone,
    `_Or type any custom amount to calculate:_\n` +
    `_Example: type 45000 for ₦45,000_`
  );
}

async function calculateAndShowFeeSplit(
  phone:   string,
  session: DemoSession,
  schoolFee: number,
  wa:      WhatsApp
): Promise<void> {
  const platformCommission = parseFloat((schoolFee * 0.015).toFixed(2));
  const subtotal = schoolFee + platformCommission;
  
  let paystackCharge = subtotal < 2500 ? subtotal * 0.015 : subtotal * 0.015 + 100;
  paystackCharge = Math.min(paystackCharge, 2000);
  paystackCharge = parseFloat(paystackCharge.toFixed(2));

  const totalParentPays = schoolFee + platformCommission + paystackCharge;

  await wa.text(
    phone,
    `💳 *Payment Breakdown Simulation*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 *School Fee (Your Price):* *${fmt(schoolFee)}*\n` +
    `🏷️ Platform Fee (1.5%): *${fmt(platformCommission)}*\n` +
    `🏦 Payment Gateway Fee: *${fmt(paystackCharge)}*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💳 *Total Parent Pays:* *${fmt(totalParentPays)}*\n\n` +
    `✅ *Your School Receives:* *${fmt(schoolFee)} (100%)*\n\n` +
    `Deposited directly into your registered school bank account! 🏦`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Zero deductions from your school's revenue! 🎯`,
    [
      { id: 'sandbox_mark_att', title: '📝 Try Attendance' },
      { id: 'see_pricing',      title: '💵 See Setup Fees' },
      { id: 'register_now',     title: '🚀 Register School' },
    ]
  );
}

// ============================================================
// 5. PARENT EXPERIENCE VIEWS
// ============================================================

async function showParentAttendanceView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'parent_att_view');

  await wa.text(
    phone,
    `👨‍👩‍👧 *What Parents See (Attendance)*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Parent sends "attendance" to the bot:\n\n` +
    `📅 *Attendance Summary*\n` +
    `👤 Student: *Chidi Okonkwo*\n` +
    `🏫 Class: *JSS 3A*\n` +
    `📊 Term Attendance Rate: *94%*\n\n` +
    `✅ Present: *47 days*\n` +
    `❌ Absent:  *2 days*\n` +
    `⏰ Late:    *1 day*\n` +
    `📅 Total Days: *50 days*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Parents can check this 24/7 without calling the school office! 📱`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `What would you like to see next?`,
    [
      { id: 'sandbox_parent_fees',   title: '💳 Parent Fees View' },
      { id: 'sandbox_parent_pickup', title: '🚗 Pickup Security'  },
      { id: 'main_menu',             title: '↩️ Back to Menu'     },
    ]
  );
}

async function showParentFeesView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'parent_fees_view');

  const inv1 = DEMO_FEES.invoices[0];
  const inv2 = DEMO_FEES.invoices[1];

  await wa.text(
    phone,
    `👨‍👩‍👧 *What Parents See (Fees & Payments)*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Parent sends "fees" to the bot:\n\n` +
    `💰 *Outstanding Fees for Chidi Okonkwo*\n\n` +
    `1. *${inv1.title}*\n` +
    `   💵 Balance: *${fmt(inv1.balance)}*\n` +
    `   📅 Due: 15 Apr 2025\n\n` +
    `2. *${inv2.title}*\n` +
    `   💵 Balance: *${fmt(inv2.balance)}*\n` +
    `   📅 Due: 30 Mar 2025\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Total Outstanding: ${fmt(DEMO_FEES.totalOutstanding)}*\n\n` +
    `Parent taps *Pay Now* $\rightarrow$ Secure Paystack link $\rightarrow$ Pays via Card, Transfer or USSD!`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Reduces uncollected fees by up to 90%! 🚀`,
    [
      { id: 'sandbox_fee_calc', title: '💰 Fee Split Calc'  },
      { id: 'register_now',     title: '🚀 Register School' },
      { id: 'main_menu',        title: '↩️ Back to Menu'     },
    ]
  );
}

async function showParentPickupView(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  await logDemoInteraction(formatPhone(phone), 'parent_pickup_view');

  const contacts = DEMO_PICKUP.contacts.map((c, i) =>
    `${i + 1}. *${c.name}*\n   👥 Relationship: ${c.relationship}\n   📱 Phone: ${c.phone}`
  ).join('\n\n');

  await wa.text(
    phone,
    `🚗 *Student Pickup Management*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Parents register approved guardians. When a child is dismissed:\n\n` +
    `*Authorized Guardians for ${DEMO_PICKUP.student}:*\n\n` +
    `${contacts}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📱 *Parent instantly gets an alert:*\n` +
    `_"${DEMO_PICKUP.student} has been picked up by ${DEMO_PICKUP.recentPickup.pickedBy} at ${DEMO_PICKUP.recentPickup.time}."_\n\n` +
    `🔐 Gives parents total peace of mind regarding child security!`
  );

  await delay(1500);

  await wa.buttons(
    phone,
    `Ready to set this up for your school?`,
    [
      { id: 'see_pricing',  title: '💵 See Pricing'     },
      { id: 'register_now', title: '🚀 Register School' },
      { id: 'main_menu',    title: '↩️ Back to Menu'     },
    ]
  );
}

// ============================================================
// PRICING & REGISTRATION
// ============================================================

async function showPricing(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_PRICING';
  await saveMarketingSession(session);
  await logDemoInteraction(formatPhone(phone), 'pricing');

  await wa.text(
    phone,
    `💵 *SchoolBot Pricing*\n\n` +
    `*Transparent & Affordable:*\n\n` +
    `1️⃣ *One-Time Setup Fee*\n` +
    `   Based on your student count.\n` +
    `   Pay once — use forever! No subscriptions.\n\n` +
    `2️⃣ *1.5% Per Fee Payment*\n` +
    `   Added on top of the parent bill.\n` +
    `   Your school gets *100% of all tuition*!\n\n` +
    `✅ *No monthly maintenance fees!*\n` +
    `✅ *Includes WhatsApp bot for parents & teachers!*\n` +
    `✅ *Free onboarding support!*`
  );

  await delay(1000);

  await wa.list(
    phone,
    `💵 Setup Fee Tiers`,
    `One-time setup fee based on student population:`,
    `Commission: 1.5% per payment (paid by parent)`,
    `📋 View Plans`,
    [
      {
        title: 'One-Time Setup Tiers',
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
    `Ready to register your school?`,
    [
      { id: 'register_now', title: '🚀 Register School' },
      { id: 'talk_to_us',   title: '📞 Ask Questions'  },
      { id: 'main_menu',    title: '🎯 Test More'       },
    ]
  );
}

async function startRegistration(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: existingSchools } = await db
    .from('school_onboarding')
    .select(`
      school_id,
      schools ( id, name, is_active, onboarding_status )
    `)
    .eq('admin_phone', formatPhone(phone));

  if (existingSchools && existingSchools.length > 0) {
    const schoolList = existingSchools
      .map((s, i) => {
        const school = s.schools as Record<string, unknown> | null;
        const isActive = school?.is_active as boolean;
        const status   = school?.onboarding_status as string;
        return `${i + 1}. *${school?.name ?? 'Unknown'}*\n   ${isActive ? '🟢 Active' : `⏳ ${status}`}`;
      })
      .join('\n\n');

    await wa.buttons(
      phone,
      `🏫 *You Already Have ${existingSchools.length} School(s)*\n\n` +
      `${schoolList}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `What would you like to do?`,
      [
        { id: 'add_another_school', title: '➕ Add Another School' },
        { id: 'manage_existing',    title: '🏫 Manage Existing'     },
      ]
    );
    return;
  }

  session.state = 'REGISTERING';
  await saveMarketingSession(session);
  await logDemoInteraction(formatPhone(phone), 'registration_started');

  const prefill = {
    contactName:       session.contactName  ?? undefined,
    schoolName:        session.schoolName   ?? undefined,
    location:          session.location     ?? undefined,
    studentCountRange: session.studentCount ?? undefined,
    schoolType:        session.schoolType   ?? undefined,
  };

  const obSession = await startOnboardingSession(phone, 'marketing', prefill);

  if (session.contactName && session.schoolName) {
    await wa.text(
      phone,
      `🚀 *Let's register your school!*\n\n` +
      `👤 *Name:* ${session.contactName}\n` +
      `🏫 *School:* ${session.schoolName}\n\n` +
      `Calculating setup fee...`
    );
    await delay(1000);
    await showSetupFeeInfo(phone, obSession, wa);
  } else if (session.contactName) {
    await wa.text(
      phone,
      `🚀 *Register Your School!*\n\n` +
      `Hi *${session.contactName.split(' ')[0]}!* 👋\n\n` +
      `What is the official name of your school?`
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
// CONVERSATIONAL TEXT & AI HANDLER
// ============================================================

async function handleTextInput(
  phone:   string,
  session: DemoSession,
  rawText: string,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (session.state === 'SANDBOX_FEE_CALC' || !isNaN(parseFloat(rawText.replace(/,/g, '')))) {
    const num = parseFloat(rawText.replace(/,/g, ''));
    if (!isNaN(num) && num >= 500) {
      await calculateAndShowFeeSplit(phone, session, num, wa);
      return;
    }
  }

  if (session.state === 'COLLECTING_NAME') {
    if (rawText.trim().length >= 2) {
      session.contactName = rawText.trim();
      session.state       = 'SANDBOX_HUB';
      await saveMarketingSession(session);

      const firstName = rawText.split(' ')[0];
      await wa.text(phone, `Nice to meet you *${firstName}!* 😊`);
      await delay(800);
      await showSandboxMainMenu(phone, session, wa);
    } else {
      await wa.text(phone, `Please enter your full name:`);
    }
    return;
  }

  await handleAI(phone, session, rawText, wa);
}

async function handleAI(
  phone:   string,
  session: DemoSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const history = session.aiHistory;
  history.push({ role: 'user', content: input });

  const { intent, entities } = await ai.detectIntent(input);

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

  history.push({ role: 'assistant', content: aiResponse });
  session.aiHistory = history.slice(-20);
  await saveMarketingSession(session);

  await wa.text(phone, aiResponse);
  await delay(1200);

  switch (intent) {
    case 'attendance_demo':
      await startLiveAttendanceDemo(phone, session, wa);
      break;
    case 'fees_demo':
      await promptFeeSimulator(phone, session, wa);
      break;
    case 'pickup_demo':
      await showParentPickupView(phone, session, wa);
      break;
    case 'pricing':
      await showPricing(phone, session, wa);
      break;
    case 'register':
      await startRegistration(phone, session, wa);
      break;
    case 'see_demo':
      await showSandboxMainMenu(phone, session, wa);
      break;
    default:
      await wa.buttons(
        phone,
        `What would you like to explore next?`,
        [
          { id: 'main_menu',     title: '🎯 Test Features'   },
          { id: 'show_faq_menu', title: '❓ FAQs & Details' },
          { id: 'register_now',  title: '🚀 Register School'  },
        ]
      );
  }
}

// ─── Trial Code Handler ─────────────────────────────────────
async function handleTrialCode(
  phone: string,
  code:  string,
  wa:    WhatsApp
): Promise<void> {
  const { data, error } = await db
    .from('trial_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) {
    await wa.text(phone, `❌ The code *${code}* is invalid. Type *hi* to try our demo.`);
    return;
  }

  if (data.used || new Date(data.expires_at) < new Date()) {
    await wa.text(phone, `❌ This trial code has expired or was already used.`);
    return;
  }

  await db
    .from('trial_codes')
    .update({ used: true, used_at: new Date().toISOString(), used_by_phone: formatPhone(phone) })
    .eq('id', data.id);

  await db
    .from('trial_sessions')
    .upsert({
      phone: formatPhone(phone),
      code,
      active: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }, { onConflict: 'phone' });

  let session = await getMarketingSession(formatPhone(phone));
  if (!session) session = await createMarketingSession(formatPhone(phone));
  session.state = 'TRIAL_ACTIVE';
  await saveMarketingSession(session);

  await wa.text(
    phone,
    `🎉 *Free Trial Activated!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Your setup fee is *100% WAIVED*! 🚀\n\n` +
    `Ready to register your school?`
  );

  await delay(1000);
  await wa.buttons(
    phone,
    `Get started for FREE!`,
    [
      { id: 'register_now',      title: '🚀 Register Now' },
      { id: 'main_menu',         title: '👀 Test Sandbox' },
    ]
  );
}

// ─── Contact Options ────────────────────────────────────────
async function showContactOptions(
  phone:   string,
  session: DemoSession,
  wa:      WhatsApp
): Promise<void> {
  session.state = 'DEMO_CONTACT';
  await saveMarketingSession(session);

  const adminPhone = Deno.env.get('SUPER_ADMIN_PHONE') ?? '';

  await wa.buttons(
    phone,
    `📞 *Talk to Our Team*\n\n` +
    `We would love to answer your questions and help set up your school!\n\n` +
    `📱 WhatsApp: *${adminPhone}*\n` +
    `⏰ Available: Mon - Fri, 8:00 AM - 6:00 PM`,
    [
      { id: 'register_now', title: '🚀 Register School' },
      { id: 'main_menu',    title: '🎯 Test Sandbox'    },
    ]
  );
}
