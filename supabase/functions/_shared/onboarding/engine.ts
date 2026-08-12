// ============================================================
// SCHOOLBOT - ONBOARDING ENGINE
// supabase/functions/_shared/onboarding/engine.ts
//
// DB-backed sessions — survives Edge Function restarts.
// Includes trial code support — waives setup fee.
// ============================================================

import { getSupabase }    from '../supabase.ts';
import { WhatsApp }       from '../whatsapp.ts';
import {
  PaystackService,
  calculateSetupFee,
} from '../paystack.service.ts';
import { formatPhone }    from '../utils.ts';
import type {
  OnboardingState,
  OnboardingStep,
} from '../types.ts';

const db       = getSupabase();
const paystack = new PaystackService();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

const SESSION_TTL_HOURS = 6;

// ─── Trial code pattern ───────────────────────────────────
const TRIAL_CODE_PATTERN =
  /^trial-[a-z0-9]{4}-[a-z0-9]{4}$/i;

// ============================================================
// DB-BACKED SESSION HELPERS
// ============================================================

export async function getOnboardingSession(
  phone: string
): Promise<OnboardingState | null> {
  const formatted = formatPhone(phone);
  const cutoff    = new Date(
    Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from('onboarding_sessions')
    .select('*')
    .eq('phone', formatted)
    .gte('last_activity', cutoff)
    .maybeSingle();

  if (error || !data) return null;

  return {
    phone:             data.phone,
    step:              data.step              as OnboardingStep,
    source:            data.source            as 'marketing' | 'main',
    contactName:       data.contact_name      ?? null,
    schoolName:        data.school_name       ?? null,
    studentCount:      data.student_count     ?? null,
    studentCountRange: data.student_count_range ?? null,
    schoolType:        data.school_type       ?? null,
    location:          data.location          ?? null,
    email:             data.email             ?? null,
    schoolId:          data.school_id         ?? null,
    setupFeePaid:      data.setup_fee_paid    ?? false,
    tempData: (
      data.temp_data as Record<string, unknown>
    ) ?? {},
    lastActivity: new Date(
      data.last_activity
    ).getTime(),
  };
}

export async function setOnboardingSession(
  phone:   string,
  session: OnboardingState
): Promise<void> {
  const formatted = formatPhone(phone);

  const { error } = await db
    .from('onboarding_sessions')
    .upsert(
      {
        phone:               formatted,
        step:                session.step,
        source:              session.source,
        contact_name:        session.contactName,
        school_name:         session.schoolName,
        student_count:       session.studentCount,
        student_count_range: session.studentCountRange,
        school_type:         session.schoolType,
        location:            session.location,
        email:               session.email,
        school_id:           session.schoolId,
        setup_fee_paid:      session.setupFeePaid,
        temp_data:           session.tempData,
        last_activity:       new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );

  if (error) {
    console.error(
      '[Onboarding] setSession error:',
      error.message
    );
  }
}

export async function clearOnboardingSession(
  phone: string
): Promise<void> {
  const formatted = formatPhone(phone);
  await db
    .from('onboarding_sessions')
    .delete()
    .eq('phone', formatted);
}

export async function startOnboardingSession(
  phone:    string,
  source:   'marketing' | 'main',
  prefill?: Partial<OnboardingState>
): Promise<OnboardingState> {
  let startStep: OnboardingStep = 'COLLECT_NAME';

  if (prefill?.contactName && prefill?.schoolName) {
    startStep = 'COLLECT_STUDENT_COUNT';
  } else if (prefill?.contactName) {
    startStep = 'COLLECT_SCHOOL_NAME';
  }

  const session: OnboardingState = {
    phone:             formatPhone(phone),
    step:              startStep,
    source,
    contactName:       prefill?.contactName       ?? null,
    schoolName:        prefill?.schoolName        ?? null,
    studentCount:      null,
    studentCountRange: prefill?.studentCountRange ?? null,
    schoolType:        prefill?.schoolType        ?? null,
    location:          prefill?.location          ?? null,
    email:             prefill?.email             ?? null,
    schoolId:          null,
    setupFeePaid:      false,
    tempData:          {},
    lastActivity:      Date.now(),
  };

  await setOnboardingSession(phone, session);

  console.log(
    `[Onboarding] ✅ Session started for ${phone} | ` +
    `step: ${startStep} | source: ${source}`
  );

  return session;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function handleOnboardingInput(
  phone:   string,
  input:   string,
  rawText: string,
  wa:      WhatsApp,
  source:  'marketing' | 'main'
): Promise<boolean> {
  let session = await getOnboardingSession(phone);
  if (!session) return false;

  session.lastActivity = Date.now();
  await setOnboardingSession(phone, session);

  // Cancel keywords
  if (
    ['cancel', 'exit', 'quit'].includes(
      input.toLowerCase()
    )
  ) {
    await clearOnboardingSession(phone);
    await wa.text(
      phone,
      `Onboarding cancelled.\n\n` +
      `Type *hi* anytime to start again.`
    );
    return true;
  }

  console.log(
    `[Onboarding] Handling step: ${session.step} | ` +
    `input: "${input.substring(0, 30)}"`
  );

  switch (session.step) {
    case 'COLLECT_NAME':
      await handleCollectName(
        phone, session, rawText, wa
      );
      break;
    case 'COLLECT_SCHOOL_NAME':
      await handleCollectSchoolName(
        phone, session, rawText, wa
      );
      break;
    case 'COLLECT_STUDENT_COUNT':
      await handleCollectStudentCount(
        phone, session, input, wa
      );
      break;
    case 'COLLECT_SCHOOL_TYPE':
      await handleCollectSchoolType(
        phone, session, input, wa
      );
      break;
    case 'COLLECT_LOCATION':
      await handleCollectLocation(
        phone, session, rawText, wa
      );
      break;
    case 'COLLECT_EMAIL':
      await handleCollectEmail(
        phone, session, rawText, wa
      );
      break;
    case 'SHOW_SETUP_FEE':
    case 'AWAITING_SETUP_FEE':
      await handleSetupFeeStep(
        phone, session, input, rawText, wa
      );
      break;
    case 'BANK_SELECT':
      await handleBankSelect(
        phone, session, input, wa
      );
      break;
    case 'BANK_ACCOUNT_NUMBER':
      await handleBankAccountNumber(
        phone, session, rawText, wa
      );
      break;
    case 'BANK_CONFIRM':
      await handleBankConfirm(
        phone, session, input, wa
      );
      break;
    case 'CLASS_MENU':
      await handleClassMenu(
        phone, session, input, wa
      );
      break;
    case 'CLASS_ADD_NAME':
      await handleClassAddName(
        phone, session, rawText, wa
      );
      break;
    case 'CLASS_ADD_ARM':
      await handleClassAddArm(
        phone, session, input, wa
      );
      break;
    case 'STAFF_MENU':
      await handleStaffMenu(
        phone, session, input, wa
      );
      break;
    case 'STAFF_ADD_NAME':
      await handleStaffAddName(
        phone, session, rawText, wa
      );
      break;
    case 'STAFF_ADD_PHONE':
      await handleStaffAddPhone(
        phone, session, rawText, wa
      );
      break;
    case 'STAFF_ADD_ROLE':
      await handleStaffAddRole(
        phone, session, input, wa
      );
      break;
    case 'COMPLETE':
      await showComplete(phone, session, wa);
      break;
    default:
      console.warn(
        `[Onboarding] Unknown step: ${session.step}`
      );
      return false;
  }

  return true;
}

// ============================================================
// STEP HANDLERS
// ============================================================

// ─── Step 1: Collect name ─────────────────────────────────
async function handleCollectName(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name.length < 2) {
    await wa.text(
      phone,
      `Please enter your *full name*:`
    );
    return;
  }

  session.contactName = name;
  session.step        = 'COLLECT_SCHOOL_NAME';
  await setOnboardingSession(phone, session);

  const firstName = name.split(' ')[0];
  await wa.text(
    phone,
    `Nice to meet you *${firstName}!* 😊\n\n` +
    `What is the name of your school?`
  );
}

// ─── Step 2: Collect school name ──────────────────────────
async function handleCollectSchoolName(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name.length < 3) {
    await wa.text(
      phone,
      `Please enter your *school name*:`
    );
    return;
  }

  session.schoolName = name;
  session.step       = 'COLLECT_STUDENT_COUNT';
  await setOnboardingSession(phone, session);

  await wa.list(
    phone,
    `📚 ${name}`,
    `How many students does *${name}* have?\n\n` +
    `This determines your one-time setup fee.`,
    `Setup fee is paid once. No monthly charges!`,
    `👥 Select Range`,
    [
      {
        title: 'Number of Students',
        rows: [
          {
            id:          'COUNT_1_100',
            title:       '1 — 100 students',
            description: 'Setup fee: ₦25,000',
          },
          {
            id:          'COUNT_101_300',
            title:       '101 — 300 students',
            description: 'Setup fee: ₦50,000',
          },
          {
            id:          'COUNT_301_500',
            title:       '301 — 500 students',
            description: 'Setup fee: ₦80,000',
          },
          {
            id:          'COUNT_501_1000',
            title:       '501 — 1,000 students',
            description: 'Setup fee: ₦120,000',
          },
          {
            id:          'COUNT_1001_2000',
            title:       '1,001 — 2,000 students',
            description: 'Setup fee: ₦180,000',
          },
          {
            id:          'COUNT_2001_PLUS',
            title:       '2,000+ students',
            description: 'Setup fee: ₦250,000',
          },
        ],
      },
    ]
  );
}

// ─── Step 3: Collect student count ────────────────────────
async function handleCollectStudentCount(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const countMap: Record<string, {
    count: number;
    range: string;
  }> = {
    count_1_100:     { count: 50,   range: '1-100' },
    count_101_300:   { count: 200,  range: '101-300' },
    count_301_500:   { count: 400,  range: '301-500' },
    count_501_1000:  { count: 750,  range: '501-1000' },
    count_1001_2000: { count: 1500, range: '1001-2000' },
    count_2001_plus: { count: 2500, range: '2000+' },
  };

  const selected = countMap[input.toLowerCase()];

  if (!selected) {
    await wa.text(
      phone,
      `Please select a student count range from the menu.`
    );
    return;
  }

  session.studentCount      = selected.count;
  session.studentCountRange = selected.range;
  session.step              = 'COLLECT_SCHOOL_TYPE';
  await setOnboardingSession(phone, session);

  await wa.list(
    phone,
    `🏫 School Type`,
    `What type of school is *${session.schoolName}*?`,
    `Select the most appropriate type`,
    `🏫 Select Type`,
    [
      {
        title: 'School Type',
        rows: [
          {
            id:          'TYPE_NURSERY',
            title:       '🌱 Nursery / Crèche',
            description: 'Ages 0-5',
          },
          {
            id:          'TYPE_PRIMARY',
            title:       '📚 Primary School',
            description: 'Ages 5-12',
          },
          {
            id:          'TYPE_SECONDARY',
            title:       '🎓 Secondary School',
            description: 'Ages 12-18',
          },
          {
            id:          'TYPE_COMBINED',
            title:       '🏫 Combined School',
            description: 'Multiple levels',
          },
          {
            id:          'TYPE_UNIVERSITY',
            title:       '🏛️ Tertiary / University',
            description: 'Higher education',
          },
        ],
      },
    ]
  );
}

// ─── Step 4: Collect school type ──────────────────────────
async function handleCollectSchoolType(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const typeMap: Record<string, string> = {
    type_nursery:    'Nursery/Crèche',
    type_primary:    'Primary',
    type_secondary:  'Secondary',
    type_combined:   'Combined',
    type_university: 'University/Tertiary',
  };

  const type = typeMap[input.toLowerCase()];

  if (!type) {
    await wa.text(
      phone,
      `Please select your school type from the menu.`
    );
    return;
  }

  session.schoolType = type;
  session.step       = 'COLLECT_LOCATION';
  await setOnboardingSession(phone, session);

  await wa.text(
    phone,
    `Which city or state is\n` +
    `*${session.schoolName}* located?\n\n` +
    `_Example: Lagos, Abuja, Port Harcourt, Kano_`
  );
}

// ─── Step 5: Collect location ─────────────────────────────
async function handleCollectLocation(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const location = rawText.trim();

  if (location.length < 2) {
    await wa.text(
      phone,
      `Please enter your school location:`
    );
    return;
  }

  session.location = location;
  session.step     = 'COLLECT_EMAIL';
  await setOnboardingSession(phone, session);

  await wa.text(
    phone,
    `What is your email address? 📧\n\n` +
    `_(Type your email or *skip* to continue)_`
  );
}

// ─── Step 6: Collect email ────────────────────────────────
async function handleCollectEmail(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const text = rawText.trim().toLowerCase();

  if (text !== 'skip' && rawText.includes('@')) {
    session.email = rawText.trim();
  }

  session.step = 'SHOW_SETUP_FEE';
  await setOnboardingSession(phone, session);

  await showSetupFeeInfo(phone, session, wa);
}

// ─── Step 7: Show setup fee ───────────────────────────────
export async function showSetupFeeInfo(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  // Create school record if not done yet
  if (!session.schoolId) {
    const schoolId   = await createSchoolRecord(session);
    session.schoolId = schoolId;
    await setOnboardingSession(phone, session);
  }

  // Check if fee already paid
  if (await checkSetupFeePaid(session.schoolId)) {
    session.setupFeePaid = true;
    session.step         = 'BANK_SELECT';
    await setOnboardingSession(phone, session);
    await startBankSetup(phone, session, wa);
    return;
  }

  // ✅ Check for active trial session
  const hasTrial = await checkActiveTrial(
    formatPhone(phone)
  );

  if (hasTrial) {
    await handleTrialOnboarding(phone, session, wa);
    return;
  }

  // Normal paid flow
  const feeInfo = await calculateSetupFee(
    session.studentCount ?? 100
  );

  if (!feeInfo) {
    await wa.text(
      phone,
      `❌ Could not calculate setup fee.\n\n` +
      `Contact us: ` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
    return;
  }

  await wa.text(
    phone,
    `🎉 *Almost ready!*\n\n` +
    `Let me confirm your details:\n\n` +
    `👤 *Name:* ${session.contactName}\n` +
    `🏫 *School:* ${session.schoolName}\n` +
    `🏙️ *Location:* ${session.location}\n` +
    `👥 *Students:* ${session.studentCountRange}\n` +
    `🏫 *Type:* ${session.schoolType}\n` +
    (session.email
      ? `📧 *Email:* ${session.email}\n`
      : '') +
    `\n━━━━━━━━━━━━━━━━\n` +
    `💰 *One-Time Setup Fee*\n\n` +
    `📦 *Tier:* ${feeInfo.tier}\n` +
    `💵 *Amount:* ${fmt(feeInfo.amount)}\n\n` +
    `*What you get:*\n` +
    `✅ WhatsApp bot for parents\n` +
    `✅ Admin bot for teachers\n` +
    `✅ Online fee collection\n` +
    `✅ Attendance management\n` +
    `✅ Student pickup system\n` +
    `✅ Reports & analytics\n` +
    `✅ Lifetime access\n\n` +
    `*After this:*\n` +
    `Only *1.5% per fee payment*\n` +
    `added on parent's bill.\n` +
    `Your school gets *100%*! 💪\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `💡 *Have a trial code?*\n` +
    `Type it now to get started FREE!`
  );

  await delay(1000);

  await wa.buttons(
    phone,
    `Ready to pay and get started?`,
    [
      {
        id:    'PROCEED_SETUP_FEE',
        title: '💳 Pay Setup Fee',
      },
      {
        id:    'SETUP_FEE_QUESTION',
        title: '❓ I have questions',
      },
    ]
  );

  session.step = 'AWAITING_SETUP_FEE';
  await setOnboardingSession(phone, session);
}

// ─── Step 7b: Handle setup fee actions ────────────────────
// ✅ Now accepts rawText to check trial code pattern
async function handleSetupFeeStep(
  phone:   string,
  session: OnboardingState,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  // ✅ TRIAL CODE CHECK — runs first
  // User can type trial code at this step
  if (TRIAL_CODE_PATTERN.test(rawText.trim())) {
    console.log(
      `[Onboarding] Trial code at setup fee step: ` +
      `${rawText.trim()}`
    );
    await handleTrialCodeInOnboarding(
      phone,
      rawText.trim().toUpperCase(),
      session,
      wa
    );
    return;
  }

  // Check if payment was completed
  if (await checkSetupFeePaid(session.schoolId)) {
    session.setupFeePaid = true;
    session.step         = 'BANK_SELECT';
    await setOnboardingSession(phone, session);
    await wa.text(
      phone,
      `✅ *Payment confirmed!*\n\nLet's continue setup.`
    );
    await delay(500);
    await startBankSetup(phone, session, wa);
    return;
  }

  if (
    input === 'proceed_setup_fee' ||
    input === 'pay_setup_fee'     ||
    input === 'retry_payment'
  ) {
    await generateAndSendSetupFeeLink(
      phone, session, wa
    );
    return;
  }

  if (input === 'setup_fee_question') {
    await wa.text(
      phone,
      `❓ *Common Questions*\n\n` +
      `*Q: Is the setup fee refundable?*\n` +
      `A: Yes, within 7 days if not satisfied.\n\n` +
      `*Q: Are there monthly fees?*\n` +
      `A: No! Only 1.5% commission per payment,\n` +
      `added on parent's bill — not yours.\n\n` +
      `*Q: Can I pay in installments?*\n` +
      `A: Contact us to discuss.\n\n` +
      `📞 *Talk to us:*\n` +
      `${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}`
    );
    await delay(1000);
    await wa.buttons(
      phone,
      `Ready to proceed?`,
      [
        { id: 'PROCEED_SETUP_FEE', title: '💳 Pay Now' },
        { id: 'SETUP_TALK_TO_US',  title: '📞 Call Us' },
      ]
    );
    return;
  }

  if (input === 'setup_talk_to_us') {
    await wa.text(
      phone,
      `📞 *Talk to Our Team*\n\n` +
      `WhatsApp us directly:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*\n\n` +
      `Or type *pay* when ready!`
    );
    return;
  }

  if (
    input === 'check_payment' ||
    input === 'check_setup_payment'
  ) {
    const paid =
      await checkSetupFeePaid(session.schoolId);
    if (paid) {
      session.setupFeePaid = true;
      session.step         = 'BANK_SELECT';
      await setOnboardingSession(phone, session);
      await wa.text(
        phone,
        `✅ *Payment confirmed!* Let's continue.`
      );
      await delay(500);
      await startBankSetup(phone, session, wa);
    } else {
      await wa.buttons(
        phone,
        `⏳ Payment not confirmed yet.\n\n` +
        `Complete payment using the link sent.\n\n` +
        `Contact us if having issues:\n` +
        `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`,
        [
          { id: 'RETRY_PAYMENT', title: '🔄 New Pay Link' },
          { id: 'CHECK_PAYMENT', title: '✅ Check Again' },
        ]
      );
    }
    return;
  }

  // Default — show setup fee again
  await showSetupFeeInfo(phone, session, wa);
}

// ─── Generate Paystack setup fee link ─────────────────────
async function generateAndSendSetupFeeLink(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  if (!session.schoolId) {
    const schoolId   = await createSchoolRecord(session);
    session.schoolId = schoolId;
    await setOnboardingSession(phone, session);
  }

  const feeInfo = await calculateSetupFee(
    session.studentCount ?? 100
  );
  if (!feeInfo) return;

  await wa.text(phone, `⏳ Generating payment link...`);

  const appUrl = Deno.env.get('APP_URL')!;

  const result = await paystack.initializeSetupFeePayment({
    schoolId:     session.schoolId!,
    schoolName:   session.schoolName!,
    adminEmail:   session.email ?? `${phone}@schoolbot.ng`,
    adminPhone:   phone,
    amount:       feeInfo.amount,
    studentCount: session.studentCount!,
    tierName:     feeInfo.tier,
    callbackUrl:
      `${appUrl}/functions/v1/payment-callback` +
      `?type=setup_fee`,
  });

  await wa.text(
    phone,
    `💳 *Setup Fee Payment*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 *${session.schoolName}*\n` +
    `📦 *Tier:* ${feeInfo.tier}\n` +
    `💵 *Amount:* ${fmt(feeInfo.amount)}\n` +
    `🔖 *Ref:* ${result.reference}\n\n` +
    `👇 *Tap to pay securely:*\n` +
    `${result.paymentUrl}\n\n` +
    `⏰ Link expires in *30 minutes*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `After payment your account\n` +
    `activates automatically! ✅\n\n` +
    `_Tap *Check Payment* after paying_`
  );

  await delay(1000);

  await wa.buttons(
    phone,
    `Need help?`,
    [
      { id: 'CHECK_PAYMENT', title: '✅ Check Payment' },
      { id: 'RETRY_PAYMENT', title: '🔄 New Link' },
    ]
  );
}

// ============================================================
// ✅ TRIAL CODE HELPERS
// ============================================================

// ─── Check if phone has an active trial ───────────────────
async function checkActiveTrial(
  phone: string
): Promise<boolean> {
  const { data } = await db
    .from('trial_sessions')
    .select('id, expires_at, active')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle();

  if (!data) return false;

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    await db
      .from('trial_sessions')
      .update({ active: false })
      .eq('phone', phone);
    return false;
  }

  return true;
}

// ─── Handle trial code typed during onboarding ────────────
// Called when user types TRIAL-XXXX-XXXX at setup fee step
async function handleTrialCodeInOnboarding(
  phone:   string,
  code:    string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  console.log(
    `[Onboarding] Checking trial code: ${code} ` +
    `for phone: ${phone}`
  );

  // Look up code in DB
  const { data, error } = await db
    .from('trial_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  console.log(
    `[Onboarding] Trial code DB result:`,
    JSON.stringify({ data, error })
  );

  // Code not found
  if (error || !data) {
    await wa.text(
      phone,
      `❌ *Invalid Code*\n\n` +
      `The code *${code}* is not valid.\n\n` +
      `Please check the code and try again.\n\n` +
      `Or proceed with normal payment:`
    );
    await delay(500);
    await wa.buttons(
      phone,
      `What would you like to do?`,
      [
        {
          id:    'PROCEED_SETUP_FEE',
          title: '💳 Pay Setup Fee',
        },
        {
          id:    'SETUP_FEE_QUESTION',
          title: '❓ Questions',
        },
      ]
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
      `Contact us for a new code:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
    await delay(500);
    await wa.buttons(
      phone,
      `Or proceed with normal payment:`,
      [
        {
          id:    'PROCEED_SETUP_FEE',
          title: '💳 Pay Setup Fee',
        },
      ]
    );
    return;
  }

  // Expired
  if (new Date(data.expires_at) < new Date()) {
    await wa.text(
      phone,
      `❌ *Code Expired*\n\n` +
      `This trial code has expired.\n\n` +
      `Contact us for a new code:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
    await delay(500);
    await wa.buttons(
      phone,
      `Or proceed with normal payment:`,
      [
        {
          id:    'PROCEED_SETUP_FEE',
          title: '💳 Pay Setup Fee',
        },
      ]
    );
    return;
  }

  // ✅ Valid code! Apply trial
  console.log(
    `[Onboarding] ✅ Valid trial code! ` +
    `Applying for ${phone}...`
  );

  // Mark code as used
  const { error: updateError } = await db
    .from('trial_codes')
    .update({
      used:          true,
      used_at:       new Date().toISOString(),
      used_by_phone: formatPhone(phone),
    })
    .eq('id', data.id);

  if (updateError) {
    console.error(
      '[Onboarding] Trial code update error:',
      updateError
    );
  }

  // Save trial session
  const { error: sessionError } = await db
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

  if (sessionError) {
    console.error(
      '[Onboarding] Trial session error:',
      sessionError
    );
  }

  // Notify super admin
  const superPhone =
    Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
  if (superPhone) {
    try {
      const notifyWa = new WhatsApp();
      await notifyWa.text(
        superPhone,
        `🎁 *Trial Code Used!*\n\n` +
        `Code: *${code}*\n` +
        `School: ${data.school_name ?? 'Unknown'}\n` +
        `Phone: ${formatPhone(phone)}\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    } catch {
      // Non-critical
    }
  }

  // Apply trial — skip payment
  await handleTrialOnboarding(phone, session, wa);
}

// ─── Apply trial — skip setup fee payment ─────────────────
async function handleTrialOnboarding(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  console.log(
    `[Onboarding] ✅ Applying trial for ${phone}`
  );

  // Mark school setup fee as paid (FREE)
  await db
    .from('schools')
    .update({
      setup_fee_paid:    true,
      setup_fee_amount:  0,
      setup_fee_paid_at: new Date().toISOString(),
      onboarding_status: 'setup_fee_paid',
      is_active:         true,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', session.schoolId);

  // Update onboarding record
  await db
    .from('school_onboarding')
    .update({
      step_setup_fee_paid: true,
      current_step:        'bank',
      updated_at:          new Date().toISOString(),
    })
    .eq('school_id', session.schoolId);

  // Deactivate trial session
  await db
    .from('trial_sessions')
    .update({ active: false })
    .eq('phone', formatPhone(phone));

  // Update onboarding session
  session.setupFeePaid = true;
  session.step         = 'BANK_SELECT';
  await setOnboardingSession(phone, session);

  // Tell school the good news
  await wa.text(
    phone,
    `🎉 *Free Trial Applied!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ Setup fee — *WAIVED!*\n\n` +
    `*${session.schoolName}* is now\n` +
    `registered for *FREE*! 🚀\n\n` +
    `Let's continue your setup...\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1000);

  // Continue to bank setup
  await startBankSetup(phone, session, wa);
}

// ─── Step 8: Bank setup ───────────────────────────────────
async function startBankSetup(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🏦 *Bank Account Setup*\n\n` +
    `To receive fee payments into your\n` +
    `bank account, we need your details.\n\n` +
    `✅ *Your school gets 100% of every fee*\n` +
    `The 1.5% platform fee is added on\n` +
    `top of parent payments.\n\n` +
    `Let's add your bank account! 💪`
  );

  await delay(800);
  await showBankList(phone, session, wa);
}

async function showBankList(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `🏦 Select Your Bank`,
    `Choose your school's bank where fee\n` +
    `payments will be deposited:`,
    `Parents pay → Paystack → Your account`,
    `🏦 Select Bank`,
    [
      {
        title: 'Commercial Banks',
        rows: [
          {
            id:          'BANK_044',
            title:       'Access Bank',
            description: 'Code: 044',
          },
          {
            id:          'BANK_058',
            title:       'GTBank',
            description: 'Code: 058',
          },
          {
            id:          'BANK_011',
            title:       'First Bank',
            description: 'Code: 011',
          },
          {
            id:          'BANK_057',
            title:       'Zenith Bank',
            description: 'Code: 057',
          },
          {
            id:          'BANK_033',
            title:       'UBA',
            description: 'Code: 033',
          },
          {
            id:          'BANK_232',
            title:       'Sterling Bank',
            description: 'Code: 232',
          },
          {
            id:          'BANK_221',
            title:       'Stanbic IBTC',
            description: 'Code: 221',
          },
          {
            id:          'BANK_070',
            title:       'Fidelity Bank',
            description: 'Code: 070',
          },
        ],
      },
      {
        title: 'Digital Banks & Others',
        rows: [
          {
            id:          'BANK_50211',
            title:       'Kuda Bank',
            description: 'Code: 50211',
          },
          {
            id:          'BANK_999992',
            title:       'OPay',
            description: 'Code: 999992',
          },
          {
            id:          'BANK_999991',
            title:       'PalmPay',
            description: 'Code: 999991',
          },
          {
            id:          'BANK_50515',
            title:       'Moniepoint',
            description: 'Code: 50515',
          },
          {
            id:          'BANK_032',
            title:       'Union Bank',
            description: 'Code: 032',
          },
          {
            id:          'BANK_035',
            title:       'Wema Bank',
            description: 'Code: 035',
          },
        ],
      },
    ]
  );

  session.step = 'BANK_SELECT';
  await setOnboardingSession(phone, session);
}

async function handleBankSelect(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('bank_')) {
    await showBankList(phone, session, wa);
    return;
  }

  const bankCode = input.replace('bank_', '');

  const bankNames: Record<string, string> = {
    '044':    'Access Bank',
    '058':    'GTBank',
    '011':    'First Bank',
    '057':    'Zenith Bank',
    '033':    'UBA',
    '232':    'Sterling Bank',
    '221':    'Stanbic IBTC',
    '070':    'Fidelity Bank',
    '50211':  'Kuda Bank',
    '999992': 'OPay',
    '999991': 'PalmPay',
    '50515':  'Moniepoint',
    '032':    'Union Bank',
    '035':    'Wema Bank',
  };

  const bankName = bankNames[bankCode] ?? 'Your Bank';

  session.tempData = {
    ...session.tempData,
    bankCode,
    bankName,
  };
  session.step = 'BANK_ACCOUNT_NUMBER';
  await setOnboardingSession(phone, session);

  await wa.text(
    phone,
    `🏦 *${bankName}* selected ✅\n\n` +
    `Enter your *10-digit account number:*`
  );
}

async function handleBankAccountNumber(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const cleaned = rawText.replace(/\D/g, '');

  if (cleaned.length !== 10) {
    await wa.text(
      phone,
      `❌ Account number must be exactly *10 digits*.\n\n` +
      `Please enter again:`
    );
    return;
  }

  const { bankCode, bankName } =
    session.tempData as Record<string, string>;

  await wa.text(phone, `⏳ Verifying account...`);

  const resolved = await paystack.resolveAccount(
    cleaned, bankCode
  );

  if (!resolved) {
    await wa.buttons(
      phone,
      `❌ Could not verify account\n` +
      `with *${bankName}*.\n\n` +
      `Please check and try again.`,
      [
        { id: `BANK_${bankCode}`, title: '🔄 Try Again' },
        { id: 'BANK_CHANGE',      title: '🏦 Change Bank' },
      ]
    );
    return;
  }

  session.tempData = {
    ...session.tempData,
    accountNumber: cleaned,
    accountName:   resolved.accountName,
  };
  session.step = 'BANK_CONFIRM';
  await setOnboardingSession(phone, session);

  await wa.buttons(
    phone,
    `🏦 *Account Verified!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏦 *Bank:* ${bankName}\n` +
    `💳 *Account:* ${cleaned}\n` +
    `👤 *Name:* ${resolved.accountName}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Is this correct?`,
    [
      { id: 'BANK_CONFIRM_YES', title: '✅ Yes, Confirm' },
      { id: 'BANK_CONFIRM_NO',  title: '❌ No, Change' },
    ]
  );
}

async function handleBankConfirm(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (
    input === 'bank_confirm_no' ||
    input === 'bank_change'
  ) {
    await showBankList(phone, session, wa);
    return;
  }

  if (input !== 'bank_confirm_yes') return;

  const {
    bankCode,
    bankName,
    accountNumber,
    accountName,
  } = session.tempData as Record<string, string>;

  await wa.text(
    phone,
    `⏳ Setting up your payment account...`
  );

  try {
    await paystack.createSubaccount({
      schoolId:      session.schoolId!,
      businessName:  session.schoolName!,
      bankCode,
      accountNumber,
    });

    await db
      .from('school_onboarding')
      .update({
        step_bank_added: true,
        current_step:    'classes',
        updated_at:      new Date().toISOString(),
      })
      .eq('school_id', session.schoolId);

    await wa.text(
      phone,
      `✅ *Bank Account Added!*\n\n` +
      `🏦 ${bankName}\n` +
      `👤 ${accountName}\n` +
      `💳 ${accountNumber}\n\n` +
      `Parents will pay directly into\n` +
      `this account from now on. 💰`
    );

    await delay(1000);

    session.step = 'CLASS_MENU';
    await setOnboardingSession(phone, session);
    await showClassSetup(phone, session, wa);
  } catch (err) {
    await wa.text(
      phone,
      `❌ Bank setup failed. Please try again.\n\n` +
      `Contact us: ` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
    console.error('[Onboarding] Bank error:', err);
  }
}

// ─── Step 9: Class setup ──────────────────────────────────
async function showClassSetup(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  const { data: classes } = await db
    .from('classes')
    .select('id, name, class_arms( name )')
    .eq('school_id', session.schoolId)
    .order('level', { ascending: true });

  const classList = classes?.length
    ? classes.map((c) => {
        const arms = (
          c.class_arms as Array<{ name: string }> | null
        )?.map((a) => a.name).join(', ');
        return (
          `📚 *${c.name}*` +
          (arms ? ` (${arms})` : '')
        );
      }).join('\n')
    : '_No classes added yet_';

  await wa.list(
    phone,
    `📚 Class Setup`,
    `*Current Classes:*\n${classList}\n\n` +
    `Add your classes:`,
    `You can always add more classes later`,
    `📚 Manage Classes`,
    [
      {
        title: 'Add Classes',
        rows: [
          {
            id:          'ADD_CLASS_MANUAL',
            title:       '➕ Add Class Manually',
            description: 'Add one class at a time',
          },
          {
            id:          'USE_TEMPLATE_NURSERY',
            title:       '🌱 Nursery Template',
            description: 'Crèche, Nursery 1-2, KG 1-2',
          },
          {
            id:          'USE_TEMPLATE_PRIMARY',
            title:       '📚 Primary Template',
            description: 'Primary 1-6',
          },
          {
            id:          'USE_TEMPLATE_SECONDARY',
            title:       '🎓 Secondary Template',
            description: 'JSS 1-3, SS 1-3',
          },
          {
            id:          'USE_TEMPLATE_FULL',
            title:       '🏫 Full School Template',
            description: 'All levels combined',
          },
        ],
      },
      {
        title: 'Continue',
        rows: [
          {
            id:          'CLASSES_DONE',
            title:       '✅ Done with Classes',
            description: 'Move to staff setup',
          },
        ],
      },
    ]
  );

  session.step = 'CLASS_MENU';
  await setOnboardingSession(phone, session);
}

async function handleClassMenu(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (input === 'add_class_manual') {
    await wa.text(
      phone,
      `📚 Enter the class name:\n\n` +
      `_Example: JSS 1, Primary 3, SS 2, KG 1_`
    );
    session.step = 'CLASS_ADD_NAME';
    await setOnboardingSession(phone, session);
    return;
  }

  if (input.startsWith('use_template_')) {
    const templateType =
      input.replace('use_template_', '');
    await applyClassTemplate(
      phone, session, templateType, wa
    );
    return;
  }

  if (input === 'classes_done') {
    await db
      .from('school_onboarding')
      .update({
        step_class_added: true,
        current_step:     'staff',
        updated_at:       new Date().toISOString(),
      })
      .eq('school_id', session.schoolId);

    session.step = 'STAFF_MENU';
    await setOnboardingSession(phone, session);
    await showStaffSetup(phone, session, wa);
    return;
  }

  await showClassSetup(phone, session, wa);
}

async function handleClassAddName(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name.length < 2) {
    await wa.text(
      phone,
      `Please enter a valid class name:`
    );
    return;
  }

  session.tempData = {
    ...session.tempData,
    pendingClassName: name,
  };
  session.step = 'CLASS_ADD_ARM';
  await setOnboardingSession(phone, session);

  await wa.buttons(
    phone,
    `📚 *${name}*\n\n` +
    `How many arms does this class have?`,
    [
      { id: 'ARMS_1', title: '1 Arm (A only)' },
      { id: 'ARMS_2', title: '2 Arms (A, B)' },
      { id: 'ARMS_3', title: '3 Arms (A, B, C)' },
    ]
  );
}

async function handleClassAddArm(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const armsCount =
    input === 'arms_1' ? 1 :
    input === 'arms_2' ? 2 : 3;

  const className =
    session.tempData.pendingClassName as string;

  if (!className) {
    session.step = 'CLASS_MENU';
    await setOnboardingSession(phone, session);
    await showClassSetup(phone, session, wa);
    return;
  }

  const { data: cls } = await db
    .from('classes')
    .insert({
      school_id:  session.schoolId,
      name:       className,
      level:      1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (cls) {
    const armNames = ['A', 'B', 'C'].slice(0, armsCount);
    await db.from('class_arms').insert(
      armNames.map((armName) => ({
        class_id:   cls.id,
        name:       armName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    );

    await wa.buttons(
      phone,
      `✅ *${className}* added!\n` +
      `Arms: ${['A', 'B', 'C']
        .slice(0, armsCount)
        .join(', ')}\n\n` +
      `Add more classes or continue?`,
      [
        { id: 'ADD_CLASS_MANUAL', title: '➕ Add More' },
        { id: 'CLASSES_DONE',     title: '✅ Done' },
      ]
    );
  }

  session.step = 'CLASS_MENU';
  await setOnboardingSession(phone, session);
}

async function applyClassTemplate(
  phone:   string,
  session: OnboardingState,
  type:    string,
  wa:      WhatsApp
): Promise<void> {
  const templates: Record<
    string,
    Array<{ name: string; level: number }>
  > = {
    nursery: [
      { name: 'Crèche',    level: 1 },
      { name: 'Nursery 1', level: 2 },
      { name: 'Nursery 2', level: 3 },
      { name: 'KG 1',      level: 4 },
      { name: 'KG 2',      level: 5 },
    ],
    primary: [
      { name: 'Primary 1', level: 1 },
      { name: 'Primary 2', level: 2 },
      { name: 'Primary 3', level: 3 },
      { name: 'Primary 4', level: 4 },
      { name: 'Primary 5', level: 5 },
      { name: 'Primary 6', level: 6 },
    ],
    secondary: [
      { name: 'JSS 1', level: 1 },
      { name: 'JSS 2', level: 2 },
      { name: 'JSS 3', level: 3 },
      { name: 'SS 1',  level: 4 },
      { name: 'SS 2',  level: 5 },
      { name: 'SS 3',  level: 6 },
    ],
    full: [
      { name: 'Nursery 1', level: 1  },
      { name: 'Nursery 2', level: 2  },
      { name: 'KG 1',      level: 3  },
      { name: 'KG 2',      level: 4  },
      { name: 'Primary 1', level: 5  },
      { name: 'Primary 2', level: 6  },
      { name: 'Primary 3', level: 7  },
      { name: 'Primary 4', level: 8  },
      { name: 'Primary 5', level: 9  },
      { name: 'Primary 6', level: 10 },
      { name: 'JSS 1',     level: 11 },
      { name: 'JSS 2',     level: 12 },
      { name: 'JSS 3',     level: 13 },
      { name: 'SS 1',      level: 14 },
      { name: 'SS 2',      level: 15 },
      { name: 'SS 3',      level: 16 },
    ],
  };

  const toAdd = templates[type];
  if (!toAdd) {
    await showClassSetup(phone, session, wa);
    return;
  }

  await wa.text(
    phone,
    `⏳ Adding ${toAdd.length} classes...`
  );

  const { data: inserted } = await db
    .from('classes')
    .insert(
      toAdd.map((c) => ({
        school_id:  session.schoolId,
        name:       c.name,
        level:      c.level,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    )
    .select();

  if (inserted?.length) {
    await db.from('class_arms').insert(
      inserted.flatMap((cls) => [
        {
          class_id:   cls.id,
          name:       'A',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          class_id:   cls.id,
          name:       'B',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
    );
  }

  await wa.buttons(
    phone,
    `🎉 *${toAdd.length} Classes Added!*\n\n` +
    toAdd.map((c) => `✅ ${c.name}`).join('\n') +
    `\n\nEach class has Arms A and B.\n` +
    `You can add more arms later.`,
    [
      { id: 'ADD_CLASS_MANUAL', title: '➕ Add More' },
      { id: 'CLASSES_DONE',     title: '✅ Done' },
    ]
  );

  session.step = 'CLASS_MENU';
  await setOnboardingSession(phone, session);
}

// ─── Step 10: Staff setup ─────────────────────────────────
async function showStaffSetup(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  const { data: staffList } = await db
    .from('staff')
    .select(`
      id,
      first_name,
      last_name,
      staff_invitations ( status, token )
    `)
    .eq('school_id', session.schoolId)
    .eq('employment_status', 'active');

  const staffText = staffList?.length
    ? staffList.map((s) => {
        const inv = (
          s.staff_invitations as Array<{
            status: string;
            token:  string;
          }> | null
        )?.[0];
        const icon =
          inv?.status === 'accepted' ? '✅' : '⏳';
        return (
          `${icon} ${s.first_name} ${s.last_name}` +
          (inv?.status === 'pending'
            ? ` (Code: ${inv.token})`
            : '')
        );
      }).join('\n')
    : '_No staff added yet_';

  await wa.list(
    phone,
    `👨‍🏫 Staff Setup`,
    `*Your Staff:*\n${staffText}\n\n` +
    `Invite your teachers and admin staff.\n` +
    `Each person gets a WhatsApp invite code.`,
    `Staff get bot access instantly`,
    `👨‍🏫 Manage Staff`,
    [
      {
        title: 'Staff Options',
        rows: [
          {
            id:          'ADD_STAFF_NOW',
            title:       '➕ Add Staff Member',
            description: 'Teacher, admin or support',
          },
          {
            id:          'STAFF_DONE',
            title:       '✅ Done — Complete Setup',
            description: 'Finish and activate school',
          },
        ],
      },
    ]
  );

  session.step = 'STAFF_MENU';
  await setOnboardingSession(phone, session);
}

async function handleStaffMenu(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (input === 'add_staff_now') {
    await wa.text(
      phone,
      `👤 Enter the staff member's *full name*:\n\n` +
      `_Example: Mr. Emeka Okafor_`
    );
    session.step = 'STAFF_ADD_NAME';
    await setOnboardingSession(phone, session);
    return;
  }

  if (
    input === 'staff_done' ||
    input === 'skip_staff'
  ) {
    await db
      .from('school_onboarding')
      .update({
        step_staff_added: true,
        current_step:     'complete',
        completed:        true,
        completed_at:     new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('school_id', session.schoolId);

    await db
      .from('schools')
      .update({
        onboarding_status: 'active',
        is_active:         true,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', session.schoolId);

    session.step = 'COMPLETE';
    await setOnboardingSession(phone, session);
    await showComplete(phone, session, wa);
    return;
  }

  await showStaffSetup(phone, session, wa);
}

async function handleStaffAddName(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name.length < 3) {
    await wa.text(
      phone,
      `Please enter a valid full name:`
    );
    return;
  }

  session.tempData = {
    ...session.tempData,
    pendingStaffName: name,
  };
  session.step = 'STAFF_ADD_PHONE';
  await setOnboardingSession(phone, session);

  await wa.text(
    phone,
    `👤 *${name}*\n\n` +
    `Enter their WhatsApp phone number:\n\n` +
    `_Example: 08012345678_`
  );
}

async function handleStaffAddPhone(
  phone:   string,
  session: OnboardingState,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const cleaned = rawText.replace(/\D/g, '');

  if (cleaned.length < 10 || cleaned.length > 13) {
    await wa.text(
      phone,
      `❌ Invalid phone number.\n\n` +
      `Please enter again:\n` +
      `_Example: 08012345678_`
    );
    return;
  }

  const formatted = cleaned.startsWith('0')
    ? '234' + cleaned.slice(1)
    : cleaned;

  session.tempData = {
    ...session.tempData,
    pendingStaffPhone: formatted,
  };
  session.step = 'STAFF_ADD_ROLE';
  await setOnboardingSession(phone, session);

  await wa.list(
    phone,
    `💼 Select Role`,
    `What is *${
      session.tempData.pendingStaffName as string
    }*'s role?`,
    `Select the most appropriate role`,
    `💼 Select Role`,
    [
      {
        title: 'Academic Staff',
        rows: [
          {
            id:          'ROLE_CLASS_TEACHER',
            title:       '🏫 Class Teacher',
            description: 'Manages a specific class',
          },
          {
            id:          'ROLE_SUBJECT_TEACHER',
            title:       '📖 Subject Teacher',
            description: 'Teaches specific subjects',
          },
          {
            id:          'ROLE_HEAD_TEACHER',
            title:       '👑 Head Teacher',
            description: 'Head or Deputy Head',
          },
        ],
      },
      {
        title: 'Non-Academic Staff',
        rows: [
          {
            id:          'ROLE_ADMIN',
            title:       '💼 Admin Staff',
            description: 'School administrator',
          },
          {
            id:          'ROLE_BURSAR',
            title:       '💰 Bursar',
            description: 'Manages school finances',
          },
          {
            id:          'ROLE_SECURITY',
            title:       '🔐 Security / Gate',
            description: 'Gate and security staff',
          },
        ],
      },
    ]
  );
}

async function handleStaffAddRole(
  phone:   string,
  session: OnboardingState,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const roleMap: Record<string, {
    label: string;
    role:  string;
  }> = {
    role_class_teacher:   { label: 'Class Teacher',   role: 'teacher' },
    role_subject_teacher: { label: 'Subject Teacher', role: 'teacher' },
    role_head_teacher:    { label: 'Head Teacher',    role: 'admin' },
    role_admin:           { label: 'Admin Staff',     role: 'admin' },
    role_bursar:          { label: 'Bursar',          role: 'admin' },
    role_security:        { label: 'Security',        role: 'teacher' },
  };

  const selected = roleMap[input.toLowerCase()];
  if (!selected) return;

  const {
    pendingStaffName,
    pendingStaffPhone,
  } = session.tempData as Record<string, string>;

  try {
    const nameParts = pendingStaffName.split(' ');
    const firstName = nameParts[0];
    const lastName  =
      nameParts.slice(1).join(' ') || 'Staff';

    const { data: staff } = await db
      .from('staff')
      .insert({
        school_id:         session.schoolId,
        first_name:        firstName,
        last_name:         lastName,
        phone:             pendingStaffPhone,
        whatsapp_number:   pendingStaffPhone,
        employment_status: 'active',
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      })
      .select()
      .single();

    if (!staff) throw new Error('Staff creation failed');

    const token = generateToken();

    await db.from('staff_invitations').insert({
      school_id:  session.schoolId,
      staff_id:   staff.id,
      phone:      pendingStaffPhone,
      token,
      role:       selected.role,
      status:     'pending',
      expires_at: new Date(
        Date.now() + 48 * 60 * 60 * 1000
      ).toISOString(),
      created_at: new Date().toISOString(),
    });

    const { data: school } = await db
      .from('schools')
      .select('name')
      .eq('id', session.schoolId)
      .single();

    const inviteWa     = new WhatsApp();
    const mainBotPhone =
      Deno.env.get('WHATSAPP_DISPLAY_NUMBER') ??
      'our bot';

    await inviteWa.text(
      pendingStaffPhone,
      `🎉 *You've been invited to SchoolBot!*\n\n` +
      `Hi *${firstName}!* 👋\n\n` +
      `*${school?.name}* has added you as\n` +
      `a *${selected.label}* on SchoolBot.\n\n` +
      `To activate your access:\n\n` +
      `1️⃣ Send this code to *${mainBotPhone}*:\n\n` +
      `🔑 *${token}*\n\n` +
      `2️⃣ Follow the setup steps\n\n` +
      `⏰ This code expires in *48 hours*`
    );

    await wa.buttons(
      phone,
      `✅ *Staff Added!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${pendingStaffName}*\n` +
      `📱 ${pendingStaffPhone}\n` +
      `💼 ${selected.label}\n` +
      `🔑 *Code: ${token}*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `✅ Invite sent to their WhatsApp!`,
      [
        { id: 'ADD_STAFF_NOW', title: '➕ Add More' },
        { id: 'STAFF_DONE',    title: '✅ Complete' },
      ]
    );

    session.step = 'STAFF_MENU';
    await setOnboardingSession(phone, session);
  } catch (err) {
    console.error('[Onboarding] Staff add error:', err);
    await wa.text(
      phone,
      `❌ Failed to add staff.\n\nPlease try again.`
    );
  }
}

// ─── Step 11: Complete ────────────────────────────────────
async function showComplete(
  phone:   string,
  session: OnboardingState,
  wa:      WhatsApp
): Promise<void> {
  const [classCount, staffCount] = await Promise.all([
    db.from('classes')
      .select('id', { count: 'exact' })
      .eq('school_id', session.schoolId),
    db.from('staff')
      .select('id', { count: 'exact' })
      .eq('school_id', session.schoolId)
      .eq('employment_status', 'active'),
  ]);

  await wa.text(
    phone,
    `🎉 *Setup Complete!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 *${session.schoolName}* is now\n` +
    `LIVE on SchoolBot! 🚀\n\n` +
    `📊 *Your Setup:*\n` +
    `📚 Classes: *${classCount.count ?? 0}*\n` +
    `👨‍🏫 Staff:   *${staffCount.count ?? 0}*\n\n` +
    `*What to do next:*\n` +
    `1️⃣ Add students — send a CSV file here\n` +
    `2️⃣ Add parent WhatsApp numbers\n` +
    `3️⃣ Start marking attendance\n` +
    `4️⃣ Collect fees online!\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Type *menu* to access your\n` +
    `admin dashboard! 🚀`
  );

  // Notify super admin
  const superPhone =
    Deno.env.get('SUPER_ADMIN_PHONE');
  if (superPhone) {
    try {
      const notifyWa = new WhatsApp();
      await notifyWa.text(
        superPhone,
        `🏫 *New School Onboarded!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `🏫 *${session.schoolName}*\n` +
        `📍 ${session.location}\n` +
        `👥 ${session.studentCountRange} students\n` +
        `🏫 ${session.schoolType}\n` +
        `📱 Admin: ${phone}\n` +
        `🔗 Source: ${session.source} bot\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    } catch {
      // Non-critical
    }
  }

  // Create bot session for admin
  await db.from('bot_sessions').upsert(
    {
      phone:               formatPhone(phone),
      parent_id:           null,
      school_user_id:      null,
      school_id:           session.schoolId,
      role:                'admin',
      state:               'ADMIN_MAIN_MENU',
      sub_state:           null,
      selected_student_id: null,
      data:                {},
      last_activity:       new Date().toISOString(),
    },
    { onConflict: 'phone' }
  );

  // Clear onboarding session
  await clearOnboardingSession(phone);
}

// ============================================================
// STAFF INVITATION TOKEN HANDLER
// ============================================================

export async function handleInvitationToken(
  phone: string,
  token: string,
  wa:    WhatsApp
): Promise<void> {
  const formatted = formatPhone(phone);

  const { data: invitation } = await db
    .from('staff_invitations')
    .select(`
      id,
      school_id,
      staff_id,
      role,
      status,
      expires_at,
      schools ( id, name, is_active ),
      staff ( id, first_name, last_name, department )
    `)
    .eq('token', token.toUpperCase())
    .eq('status', 'pending')
    .single();

  if (!invitation) {
    await wa.text(
      phone,
      `❌ *Invalid or Expired Code*\n\n` +
      `The code *${token}* is not valid\n` +
      `or has already been used.\n\n` +
      `Please ask your school admin to\n` +
      `send you a new invite code.`
    );
    return;
  }

  if (
    new Date(invitation.expires_at) < new Date()
  ) {
    await db
      .from('staff_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);

    await wa.text(
      phone,
      `❌ *Code Expired*\n\n` +
      `This invite code has expired.\n\n` +
      `Ask your school admin to send\n` +
      `you a new invite code.`
    );
    return;
  }

  const school = invitation.schools as
    Record<string, unknown>;
  const staff  = invitation.staff as
    Record<string, string>;

  if (!school?.is_active) {
    await wa.text(
      phone,
      `❌ This school is not yet active.\n\n` +
      `Contact your school administrator.`
    );
    return;
  }

  await db
    .from('staff_invitations')
    .update({
      status:      'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invitation.id);

  await db.from('whatsapp_contacts').upsert(
    {
      phone:      formatted,
      full_name:
        `${staff.first_name} ${staff.last_name}`,
      school_id:  invitation.school_id,
      role:       invitation.role,
      last_seen:  new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'phone,school_id' }
  );

  await db.from('bot_sessions').upsert(
    {
      phone:               formatted,
      parent_id:           null,
      school_user_id:      null,
      school_id:           invitation.school_id,
      role:                invitation.role,
      state:               'ADMIN_MAIN_MENU',
      sub_state:           null,
      selected_student_id: null,
      data: {
        staff_id: invitation.staff_id,
      },
      last_activity: new Date().toISOString(),
    },
    { onConflict: 'phone' }
  );

  await wa.text(
    phone,
    `✅ *Welcome to SchoolBot!*\n\n` +
    `Hi *${staff.first_name}!* 👋\n\n` +
    `You now have access to\n` +
    `*${school.name}* bot.\n\n` +
    `*What you can do:*\n` +
    `✅ Mark student attendance\n` +
    `📊 View class reports\n` +
    `📢 Receive school notifications\n` +
    `👨‍🏫 Manage your class\n\n` +
    `Type *menu* to get started! 🚀`
  );
}

// ============================================================
// DATABASE HELPERS
// ============================================================

async function createSchoolRecord(
  session: OnboardingState
): Promise<string> {
  const slug =
    (session.schoolName ?? 'school')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Date.now().toString(36);

  const { data: existingLead } = await db
    .from('leads')
    .select('converted_school_id')
    .eq('phone', session.phone)
    .maybeSingle();

  if (existingLead?.converted_school_id) {
    return existingLead.converted_school_id;
  }

  const { data: school, error } = await db
    .from('schools')
    .insert({
      name:                session.schoolName,
      slug,
      email:               session.email,
      phone:               session.phone,
      country:             'Nigeria',
      timezone:            'Africa/Lagos',
      student_count:       session.studentCount ?? 100,
      onboarding_status:   'setup_fee_pending',
      is_active:           false,
      subscription_plan:   'active',
      subscription_status: 'pending',
      created_at:          new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !school) {
    throw new Error(
      `School creation failed: ${error?.message}`
    );
  }

  await db.from('school_onboarding').upsert(
    {
      school_id:           school.id,
      admin_phone:         session.phone,
      admin_name:          session.contactName,
      admin_email:         session.email,
      step_school_created: true,
      current_step:        'setup_fee',
      created_at:          new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    },
    { onConflict: 'school_id' }
  );

  await db.from('leads').upsert(
    {
      contact_name:        session.contactName ?? 'Unknown',
      school_name:         session.schoolName  ?? 'Unknown',
      school_type:         session.schoolType,
      location:            session.location,
      student_count:       session.studentCountRange,
      phone:               session.phone,
      email:               session.email,
      status:              'demo_done',
      converted_school_id: school.id,
      updated_at:          new Date().toISOString(),
    },
    { onConflict: 'phone' }
  );

  return school.id;
}

async function checkSetupFeePaid(
  schoolId: string | null
): Promise<boolean> {
  if (!schoolId) return false;

  const { data } = await db
    .from('schools')
    .select('setup_fee_paid')
    .eq('id', schoolId)
    .single();

  return data?.setup_fee_paid === true;
}

// ============================================================
// UTILITY HELPERS
// ============================================================

function generateToken(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(
    { length: 8 },
    () =>
      chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}
