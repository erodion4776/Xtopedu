// ============================================================
// SCHOOLBOT - PARENT MAIN MENU
// supabase/functions/_shared/bot/menu.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { getSupabase } from '../supabase.ts';
import type { BotSession } from '../types.ts';

const sessions = new SessionService();
const db = getSupabase();

// ─── Show main menu to parent ──────────────────────────────────
export async function showMainMenu(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const firstName =
    session.parent?.full_name?.split(' ')[0] ?? 'Parent';
  const schoolName =
    session.parent?.schools?.name ?? 'Your School';
  const greet = getGreeting();

  // Get parent subscription status
  const subInfo = await getSubscriptionInfo(
    session.parent?.id ?? '',
    session.parent?.school_id ?? ''
  );

  // Build subtitle showing their plan
  const planBadge = getPlanBadge(subInfo.planSlug);

  await wa.list(
    phone,
    `🏫 ${schoolName}`,
    `${greet} *${firstName}!* 👋\n` +
    `${planBadge}\n\n` +
    `How can I help you today?`,
    `Type *0* anytime to return here`,
    `📋 Open Menu`,
    [
      {
        title: '👨‍👩‍👧 My Children',
        rows: [
          {
            id: 'MENU_ATTENDANCE',
            title: '✅ Attendance',
            description: 'Check attendance records',
          },
          {
            id: 'MENU_FEES',
            title: '💰 School Fees',
            description: 'View & pay fees',
          },
        ],
      },
      {
        title: '🔔 Alerts & Security',
        rows: [
          {
            id: 'MENU_ALERTS',
            title: `🔔 My Alert Plan`,
            description: subInfo.planSlug === 'basic'
              ? 'FREE - Tap to upgrade'
              : `${subInfo.planName} - Active ✅`,
          },
          {
            id: 'MENU_PICKUP',
            title: '🚗 Pickup Contacts',
            description: 'View authorized pickups',
          },
        ],
      },
      {
        title: '⚙️ Account',
        rows: [
          {
            id: 'MENU_PROFILE',
            title: '👤 My Profile',
            description: 'View your details',
          },
          {
            id: 'MENU_HELP',
            title: '❓ Help',
            description: 'How to use this bot',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'MAIN_MENU');

  // Show upgrade nudge for Basic plan parents
  // Only show once every 7 days to avoid annoyance
  if (subInfo.planSlug === 'basic') {
    await showBasicUpgradeNudge(phone, session, wa);
  }
}

// ─── Show alert plan management ────────────────────────────────
export async function showAlertPlans(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const parentId = session.parent?.id ?? '';
  const schoolId = session.parent?.school_id ?? '';

  // Get current subscription
  const subInfo = await getSubscriptionInfo(parentId, schoolId);

  // Show current plan first
  await wa.text(
    phone,
    `🔔 *My Alert Plan*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Current Plan: ${getPlanBadge(subInfo.planSlug)}\n\n` +
    (subInfo.planSlug === 'basic'
      ? `You are on the *FREE Basic plan*.\n\n` +
        `You can check info yourself\n` +
        `but you get NO automatic alerts.\n\n` +
        `Upgrade to get:\n` +
        `❌ Instant absence alerts\n` +
        `🚗 Pickup security alerts\n` +
        `💰 Fee payment reminders\n` +
        `🧾 Payment receipts`
      : `Your plan is *ACTIVE* ✅\n\n` +
        `You are receiving:\n` +
        getActiveFeatures(subInfo.features) +
        (subInfo.expiresAt
          ? `\n\n📅 Expires: ${new Date(subInfo.expiresAt)
              .toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`
          : '')
    )
  );

  await new Promise((r) => setTimeout(r, 1000));

  // Show plan options
  await wa.list(
    phone,
    `🔔 Alert Plans`,
    `Choose a plan that works for you.\n\n` +
    `Less than ₦7 per day for\n` +
    `total peace of mind! 😊`,
    `Cancel anytime. No long contract.`,
    `📋 View Plans`,
    [
      {
        title: 'Available Plans',
        rows: [
          {
            id: 'PLAN_BASIC',
            title: '📦 Basic — FREE',
            description: 'Check info yourself. No alerts.',
          },
          {
            id: 'PLAN_STANDARD',
            title: '🔔 Standard — ₦200/month',
            description: 'Absent alerts + Fee reminders',
          },
          {
            id: 'PLAN_PREMIUM',
            title: '🚀 Premium — ₦400/month',
            description: 'Full alerts + Pickup security',
          },
          {
            id: 'PLAN_FAMILY',
            title: '👨‍👩‍👧 Family — ₦600/month',
            description: 'Premium for 2+ children',
          },
        ],
      },
      {
        title: 'Pay Per Term (Save Money!)',
        rows: [
          {
            id: 'PLAN_STANDARD_TERM',
            title: '🔔 Standard — ₦550/term',
            description: 'Save ₦50 vs monthly!',
          },
          {
            id: 'PLAN_PREMIUM_TERM',
            title: '🚀 Premium — ₦1,100/term',
            description: 'Save ₦100 vs monthly!',
          },
          {
            id: 'PLAN_FAMILY_TERM',
            title: '👨‍👩‍👧 Family — ₦1,650/term',
            description: 'Save ₦150 vs monthly!',
          },
        ],
      },
    ]
  );
}

// ─── Handle plan selection ─────────────────────────────────────
export async function handlePlanSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Parse plan and billing type from input
  const planMap: Record<string, {
    slug: string;
    name: string;
    amount: number;
    billing: 'monthly' | 'termly';
  }> = {
    plan_basic: {
      slug: 'basic',
      name: 'Basic',
      amount: 0,
      billing: 'monthly',
    },
    plan_standard: {
      slug: 'standard',
      name: 'Standard',
      amount: 200,
      billing: 'monthly',
    },
    plan_premium: {
      slug: 'premium',
      name: 'Premium',
      amount: 400,
      billing: 'monthly',
    },
    plan_family: {
      slug: 'family',
      name: 'Family',
      amount: 600,
      billing: 'monthly',
    },
    plan_standard_term: {
      slug: 'standard',
      name: 'Standard',
      amount: 550,
      billing: 'termly',
    },
    plan_premium_term: {
      slug: 'premium',
      name: 'Premium',
      amount: 1100,
      billing: 'termly',
    },
    plan_family_term: {
      slug: 'family',
      name: 'Family',
      amount: 1650,
      billing: 'termly',
    },
  };

  const selected = planMap[input];
  if (!selected) {
    await showAlertPlans(phone, session, wa);
    return;
  }

  // Downgrade to basic - just update DB
  if (selected.slug === 'basic') {
    await db
      .from('parent_subscriptions')
      .update({
        plan_slug: 'basic',
        plan_id: await getPlanId('basic'),
        amount_paid: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('parent_id', session.parent!.id)
      .eq('school_id', session.parent!.school_id);

    await wa.buttons(
      phone,
      `✅ *Switched to Basic Plan*\n\n` +
      `You are now on the FREE plan.\n\n` +
      `You can still check info\n` +
      `yourself anytime.\n\n` +
      `Upgrade anytime by tapping\n` +
      `🔔 My Alert Plan in the menu.`,
      [{ id: 'MAIN_MENU', title: '🏠 Main Menu' }]
    );
    return;
  }

  // Paid plan - generate payment link
  await generateSubscriptionPayment(
    phone,
    session,
    selected,
    wa
  );
}

// ─── Generate subscription payment ────────────────────────────
async function generateSubscriptionPayment(
  phone: string,
  session: BotSession,
  plan: {
    slug: string;
    name: string;
    amount: number;
    billing: 'monthly' | 'termly';
  },
  wa: WhatsApp
): Promise<void> {
  await wa.text(phone, `⏳ Generating payment link...`);

  try {
    const parent = session.parent!;
    const appUrl = Deno.env.get('APP_URL')!;
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;

    const reference =
      `SUB-${Date.now().toString(36).toUpperCase()}-` +
      `${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Initialize Paystack
    const res = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: parent.email || `${parent.phone}@schoolbot.ng`,
          amount: plan.amount * 100, // kobo
          reference,
          callback_url:
            `${appUrl}/functions/v1/payment-callback` +
            `?type=subscription&ref=${reference}`,
          metadata: {
            payment_type: 'subscription',
            parent_id: parent.id,
            school_id: parent.school_id,
            plan_slug: plan.slug,
            billing_type: plan.billing,
            parent_phone: parent.whatsapp_number ?? parent.phone,
          },
        }),
      }
    );

    const data = await res.json();
    if (!data.status) throw new Error('Payment init failed');

    // Save pending subscription payment
    await db.from('subscription_payments').insert({
      parent_id: parent.id,
      school_id: parent.school_id,
      plan_slug: plan.slug,
      billing_type: plan.billing,
      amount: plan.amount,
      gateway: 'paystack',
      gateway_ref: reference,
      status: 'Pending',
      created_at: new Date().toISOString(),
    });

    const billingLabel = plan.billing === 'termly'
      ? 'per term'
      : 'per month';

    await wa.text(
      phone,
      `🔔 *Subscribe to ${plan.name} Plan*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Plan: *${getPlanBadge(plan.slug)}*\n` +
      `Amount: *₦${plan.amount.toLocaleString()} ${billingLabel}*\n\n` +
      `What you get:\n` +
      getPlanFeaturesList(plan.slug) +
      `\n\n👇 *Tap to pay securely:*\n` +
      `${data.data.authorization_url}\n\n` +
      `⏰ Link valid for *30 minutes*\n` +
      `🔖 Ref: ${reference}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Alerts start immediately\n` +
      `after payment! ✅`
    );
  } catch (err) {
    console.error('[Subscription] payment error:', err);
    await wa.text(
      phone,
      `❌ Could not generate payment link.\n\n` +
      `Please try again.\n\n` +
      `Type *0* to go back.`
    );
  }
}

// ─── Activate subscription after payment ──────────────────────
export async function activateSubscription(
  parentId: string,
  schoolId: string,
  planSlug: string,
  billingType: 'monthly' | 'termly',
  amount: number,
  reference: string
): Promise<void> {
  // Calculate expiry date
  const now = new Date();
  let expiresAt: Date;

  if (billingType === 'termly') {
    // 3 months (one term)
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 3);
  } else {
    // 1 month
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  // Next billing date
  const nextBilling = new Date(expiresAt);

  const planId = await getPlanId(planSlug);

  // Upsert subscription
  await db
    .from('parent_subscriptions')
    .upsert(
      {
        parent_id: parentId,
        school_id: schoolId,
        plan_id: planId,
        plan_slug: planSlug,
        billing_type: billingType,
        amount_paid: amount,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        next_billing: nextBilling.toISOString().split('T')[0],
        gateway_ref: reference,
        auto_renew: true,
        updated_at: now.toISOString(),
      },
      { onConflict: 'parent_id,school_id' }
    );

  // Update subscription payment status
  await db
    .from('subscription_payments')
    .update({
      status: 'Success',
      paid_at: now.toISOString(),
    })
    .eq('gateway_ref', reference);
}

// ─── Show upgrade nudge for Basic plan parents ─────────────────
async function showBasicUpgradeNudge(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Only show nudge if it hasn't been shown in 7 days
  // We check the last time we sent this message
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentNudge } = await db
    .from('notifications')
    .select('id')
    .eq('recipient', phone)
    .eq('type', 'upgrade_nudge')
    .gte('created_at', sevenDaysAgo)
    .single();

  if (recentNudge) return; // Already nudged this week

  // Small delay so it doesn't feel spammy
  await new Promise((r) => setTimeout(r, 2000));

  await wa.buttons(
    phone,
    `💡 *Did you know?*\n\n` +
    `You are on the *FREE Basic plan*.\n\n` +
    `You will NOT receive automatic\n` +
    `alerts if your child is:\n` +
    `❌ Absent from school\n` +
    `🚗 Picked up by someone\n` +
    `💰 Has overdue fees\n\n` +
    `Upgrade to *Standard* for just\n` +
    `*₦200/month* — less than ₦7/day!\n\n` +
    `Less than the price of one\n` +
    `sachet of water per week! 💧`,
    [
      { id: 'MENU_ALERTS', title: '🔔 Upgrade Now' },
      { id: 'MAIN_MENU', title: '❌ No Thanks' },
    ]
  );

  // Log that we sent the nudge
  await db.from('notifications').insert({
    school_id: session.parent?.school_id,
    channel: 'whatsapp',
    type: 'upgrade_nudge',
    recipient: phone,
    title: 'Upgrade nudge sent',
    message: 'Basic plan upgrade nudge',
    status: 'sent',
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

// ─── Show profile ──────────────────────────────────────────────
export async function showProfile(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const parent = session.parent!;
  const school = parent.schools;
  const students = session.students ?? [];

  // Get subscription info
  const subInfo = await getSubscriptionInfo(
    parent.id,
    parent.school_id
  );

  const childrenList = students.length
    ? students
        .map(
          (s) =>
            `• *${s.full_name}*\n` +
            `  🏫 ${s.class_name} ${s.arm_name}`
        )
        .join('\n\n')
    : '_No children linked_';

  await wa.buttons(
    phone,
    `👤 *My Profile*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *Name:* ${parent.full_name}\n` +
    `📱 *Phone:* ${parent.phone}\n` +
    `📧 *Email:* ${parent.email ?? 'Not set'}\n` +
    `🏫 *School:* ${school?.name ?? 'N/A'}\n` +
    `🔔 *Alert Plan:* ${getPlanBadge(subInfo.planSlug)}\n\n` +
    `👨‍👩‍👧 *My Children (${students.length}):*\n\n` +
    `${childrenList}`,
    [
      { id: 'MENU_ALERTS', title: '🔔 Manage Alerts' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}

// ─── Show help ─────────────────────────────────────────────────
export async function showHelp(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `❓ *How to use SchoolBot*\n\n` +
    `📌 *Keywords:*\n` +
    `• Type *menu* or *hi* → Main menu\n` +
    `• Type *0* or *back* → Go back\n\n` +
    `📌 *What you can do:*\n` +
    `✅ Check daily attendance\n` +
    `📊 View term attendance summary\n` +
    `💰 View & pay school fees\n` +
    `🧾 Receive payment receipts\n` +
    `🚗 View pickup contacts\n` +
    `🔔 Manage your alert plan\n\n` +
    `📌 *Alert Plans:*\n` +
    `📦 Basic (FREE) - Check yourself\n` +
    `🔔 Standard (₦200) - Absent alerts\n` +
    `🚀 Premium (₦400) - Full alerts\n` +
    `👨‍👩‍👧 Family (₦600) - 2+ children\n\n` +
    `📞 *Need help?*\n` +
    `Contact your school admin.`
  );
}

// ─── Show new user options ─────────────────────────────────────
export async function showNewUserOptions(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `Your number is not registered yet.\n\n` +
    `What would you like to do?`,
    [
      { id: 'START_SCHOOL_ONBOARDING', title: '🏫 Register School' },
      { id: 'ENTER_INVITE_CODE', title: '🔑 I Have a Code' },
    ],
    'Welcome!',
    'Register your school or join with invite code'
  );
}

// ─── Show invite code prompt ───────────────────────────────────
export async function showInviteCodePrompt(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🔑 *Enter Invite Code*\n\n` +
    `Type your *8-character invite code*\n` +
    `sent by your school admin.\n\n` +
    `_Example: ABC12345_\n\n` +
    `Type *hi* to go back.`
  );
}

// ─── Helpers ───────────────────────────────────────────────────

async function getSubscriptionInfo(
  parentId: string,
  schoolId: string
): Promise<{
  planSlug: string;
  planName: string;
  features: Record<string, boolean>;
  expiresAt: string | null;
  status: string;
}> {
  if (!parentId || !schoolId) {
    return {
      planSlug: 'basic',
      planName: 'Basic',
      features: {},
      expiresAt: null,
      status: 'active',
    };
  }

  const { data: sub } = await db
    .from('parent_subscriptions')
    .select(`
      plan_slug,
      status,
      expires_at,
      alert_plans ( name, features )
    `)
    .eq('parent_id', parentId)
    .eq('school_id', schoolId)
    .single();

  if (!sub) {
    return {
      planSlug: 'basic',
      planName: 'Basic',
      features: {},
      expiresAt: null,
      status: 'active',
    };
  }

  const plan = sub.alert_plans as Record<string, unknown> | null;

  return {
    planSlug: sub.plan_slug ?? 'basic',
    planName: (plan?.name as string) ?? 'Basic',
    features: (plan?.features as Record<string, boolean>) ?? {},
    expiresAt: sub.expires_at ?? null,
    status: sub.status ?? 'active',
  };
}

async function getPlanId(slug: string): Promise<string | null> {
  const { data } = await db
    .from('alert_plans')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id ?? null;
}

function getPlanBadge(planSlug: string): string {
  const badges: Record<string, string> = {
    basic:    '📦 Basic (FREE)',
    standard: '🔔 Standard',
    premium:  '🚀 Premium',
    family:   '👨‍👩‍👧 Family',
  };
  return badges[planSlug] ?? '📦 Basic (FREE)';
}

function getActiveFeatures(
  features: Record<string, boolean>
): string {
  const lines: string[] = [];
  if (features.notify_present) lines.push('✅ Present alerts');
  if (features.notify_absent)  lines.push('❌ Absent alerts');
  if (features.notify_late)    lines.push('⏰ Late alerts');
  if (features.notify_pickup)  lines.push('🚗 Pickup alerts');
  if (features.notify_fees)    lines.push('💰 Fee reminders');
  if (features.notify_receipt) lines.push('🧾 Payment receipts');
  if (features.weekly_report)  lines.push('📊 Weekly report');
  return lines.join('\n');
}

function getPlanFeaturesList(planSlug: string): string {
  const features: Record<string, string> = {
    standard:
      `❌ Instant absent alerts\n` +
      `⏰ Late arrival alerts\n` +
      `💰 Fee payment reminders\n` +
      `🧾 Payment receipts`,
    premium:
      `✅ Present & absent alerts\n` +
      `🚗 Pickup security alerts\n` +
      `💰 Fee payment reminders\n` +
      `🧾 Payment receipts\n` +
      `📊 Weekly summary report`,
    family:
      `✅ Everything in Premium\n` +
      `👨‍👩‍👧 Covers ALL your children\n` +
      `💰 Save ₦200 per extra child`,
  };
  return features[planSlug] ?? '';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Hello';
}
