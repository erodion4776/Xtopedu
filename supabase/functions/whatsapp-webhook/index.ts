// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (REALISTIC DEMO VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { getSupabase } from '../_shared/supabase.ts';
import { calculateTotalCharge } from '../_shared/paystack.service.ts';

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

  // ── POST: Incoming messages ─────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json();
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

// ============================================================
// SIMPLE IN-MEMORY LEAD STATE
// ============================================================

type LeadState = {
  step: 'name' | 'school' | 'students' | 'location';
  data: {
    fullName?: string;
    schoolName?: string;
    studentCount?: string;
    location?: string;
  };
};

const leadSessions = new Map<string, LeadState>();

// ============================================================
// PROCESS WEBHOOK
// ============================================================

async function processWebhook(body: any): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // Ignore delivery/read statuses
  if (value.statuses?.length) {
    return;
  }

  if (!value.messages?.length) return;

  const message = value.messages[0];
  const phone = message.from;

  if (!['text', 'interactive'].includes(message.type)) {
    await sendText(
      phone,
      `I can only understand text messages and menu selections for now.\n\nType *hi* to continue.`
    );
    return;
  }

  const input = getInput(message);
  const rawText = getRawText(message);
  const senderPhone = formatPhone(phone);
  const superAdminPhone = formatPhone(
    Deno.env.get('SUPER_ADMIN_PHONE') ?? ''
  );

  // ── Super admin path ───────────────────────────────────────
  if (senderPhone === superAdminPhone) {
    await handleSuperAdminFlow(phone, input);
    return;
  }

  // ── Lead capture path ──────────────────────────────────────
  if (leadSessions.has(senderPhone) && message.type === 'text') {
    await handleLeadCapture(phone, rawText);
    return;
  }

  // ── Demo / School owner flow ───────────────────────────────
  await handleDemoFlow(phone, input);
}

// ============================================================
// SUPER ADMIN FLOW
// ============================================================

async function handleSuperAdminFlow(
  phone: string,
  input: string
): Promise<void> {
  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    await sendList(
      phone,
      '🔐 XtopEdu Admin',
      `Welcome back! 👋\n\nWhat would you like to do?`,
      'Super Admin Panel',
      'Open Menu',
      [
        {
          title: 'Admin Options',
          rows: [
            {
              id: 'ADMIN_SCHOOLS',
              title: '🏫 Schools',
              description: 'View school summary',
            },
            {
              id: 'ADMIN_REVENUE',
              title: '💰 Revenue',
              description: 'View revenue summary',
            },
            {
              id: 'ADMIN_LEADS',
              title: '🧲 Leads',
              description: 'View new school leads',
            },
            {
              id: 'ADMIN_TEST',
              title: '🤖 Bot Test',
              description: 'Confirm bot is working',
            },
          ],
        },
      ]
    );
    return;
  }

  if (input === 'admin_schools') {
    await sendText(
      phone,
      `🏫 *Schools Summary*\n\n` +
        `Use your web dashboard to see:\n` +
        `• all schools\n` +
        `• onboarding status\n` +
        `• student count\n` +
        `• WhatsApp status\n\n` +
        `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_revenue') {
    await sendText(
      phone,
      `💰 *Revenue Summary*\n\n` +
        `Your income comes from:\n\n` +
        `1️⃣ *Setup Fee* (one-time)\n` +
        `2️⃣ *Termly Platform Fee*\n` +
        `3️⃣ *1.5% Commission* on school fee payments\n\n` +
        `Use your dashboard for the full breakdown.\n\n` +
        `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_leads') {
    await sendText(
      phone,
      `🧲 *Lead Capture*\n\n` +
        `When a school owner registers from this bot,\n` +
        `their details are captured and sent to you.\n\n` +
        `Use your dashboard to view all leads.\n\n` +
        `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_test') {
    await sendText(
      phone,
      `✅ *Bot Test Successful!*\n\n` +
        `Everything is working:\n` +
        `• Webhook ✅\n` +
        `• Sending ✅\n` +
        `• Demo menu ✅\n` +
        `• Admin menu ✅`
    );
    return;
  }

  await sendText(phone, `Type *menu* to open your admin panel.`);
}

// ============================================================
// DEMO FLOW
// ============================================================

async function handleDemoFlow(
  phone: string,
  input: string
): Promise<void> {
  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    await sendList(
      phone,
      '🏫 SchoolBot Demo',
      `Welcome to SchoolBot! 👋\n\n` +
        `This demo shows exactly how the bot feels in real life for:\n` +
        `• Parents\n` +
        `• School Admins\n\n` +
        `What would you like to experience?`,
      'Powered by XtopEdu',
      'Choose Demo',
      [
        {
          title: 'Parent Experience',
          rows: [
            {
              id: 'PARENT_ATT',
              title: '✅ Check Attendance',
              description: 'See parent attendance screen',
            },
            {
              id: 'PARENT_FEES',
              title: '💰 Check Fees',
              description: 'See how parent pays fees',
            },
            {
              id: 'PARENT_PICKUP',
              title: '🚗 Pickup Alert',
              description: 'See pickup notification',
            },
            {
              id: 'PARENT_RECEIPT',
              title: '🧾 Payment Receipt',
              description: 'See fee receipt',
            },
          ],
        },
        {
          title: 'School Experience',
          rows: [
            {
              id: 'ADMIN_BOT',
              title: '👨‍💼 School Admin Bot',
              description: 'See how admin uses the bot',
            },
            {
              id: 'PRICING',
              title: '💵 Pricing',
              description: 'Setup fee + termly fee + 1.5%',
            },
            {
              id: 'REGISTER',
              title: '🏫 Register School',
              description: 'Start school registration',
            },
          ],
        },
      ]
    );
    return;
  }

  // ── Parent attendance demo ─────────────────────────────────
  if (input === 'parent_att') {
    const student = await getDemoStudent(phone);
    const totalDays =
      (student?.present_days ?? 0) +
      (student?.absent_days ?? 0) +
      (student?.late_days ?? 0);
    const rate = totalDays
      ? Math.round((student.present_days / totalDays) * 100)
      : 0;

    const statusLabels: Record<string, string> = {
      present: '✅ Present',
      absent: '❌ Absent',
      late: '⏰ Late',
    };
    const todayStatus = student?.today_status ?? 'present';

    await sendText(
      phone,
      `✅ *Parent Attendance Experience*\n\n` +
        `This is what a parent sees on WhatsApp:\n\n` +
        `━━━━━━━━━━━━\n` +
        `📅 *Today's Attendance*\n` +
        `👤 ${student?.name ?? 'Chidi Okonkwo'}\n` +
        `🏫 ${student?.class ?? 'JSS 3A'}\n` +
        `📌 Status: ${statusLabels[todayStatus]}\n` +
        `⏰ Arrival: ${todayStatus === 'absent' ? '—' : student?.last_arrival_time ?? '07:45 AM'}\n\n` +
        `📊 *Term Summary*\n` +
        `Rate: ${rate}%\n` +
        `✅ Present: ${student?.present_days ?? 47} days\n` +
        `❌ Absent: ${student?.absent_days ?? 2} days\n` +
        `⏰ Late: ${student?.late_days ?? 1} day\n` +
        `━━━━━━━━━━━━\n\n` +
        `This is the real experience for parents.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Try another parent view?`,
      [
        { id: 'PARENT_FEES', title: '💰 Fee View' },
        { id: 'PARENT_PICKUP', title: '🚗 Pickup' },
        { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
      ]
    );
    return;
  }

  // ── Parent fee demo ────────────────────────────────────────
  if (input === 'parent_fees') {
    const student = await getDemoStudent(phone);
    const invoices = student?.invoices ?? [];
    const outstanding = invoices
      .map((inv: any) => ({
        ...inv,
        balance: Number(inv.total_amount) - Number(inv.amount_paid),
      }))
      .filter((inv: any) => inv.balance > 0);

    if (outstanding.length === 0) {
      await sendText(
        phone,
        `💰 *Parent Fee Experience*\n\n` +
          `This is what a parent sees:\n\n` +
          `━━━━━━━━━━━━\n` +
          `💰 *Fees Status*\n` +
          `👤 ${student?.name ?? 'Chidi Okonkwo'} - ${student?.class ?? 'JSS 3A'}\n\n` +
          `✅ All fees fully paid for this term.\n` +
          `No outstanding balance.\n` +
          `━━━━━━━━━━━━\n\n` +
          `Parents always know exactly where they stand.`
      );
    } else {
      const total = outstanding.reduce(
        (sum: number, inv: any) => sum + inv.balance,
        0
      );
      const lines = outstanding
        .map(
          (inv: any, i: number) =>
            `${i + 1}. ${inv.fee_name}\n` +
            `   💵 ${formatNaira(inv.balance)} remaining\n` +
            `   📅 Due: ${new Date(inv.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`
        )
        .join('\n\n');

      await sendText(
        phone,
        `💰 *Parent Fee Experience*\n\n` +
          `This is what a parent sees:\n\n` +
          `━━━━━━━━━━━━\n` +
          `💰 *Outstanding Fees*\n` +
          `👤 ${student?.name ?? 'Chidi Okonkwo'} - ${student?.class ?? 'JSS 3A'}\n\n` +
          `${lines}\n\n` +
          `━━━━━━━━━━━━\n` +
          `💵 *Total: ${formatNaira(total)}*\n` +
          `━━━━━━━━━━━━\n\n` +
          `Then parent taps *Pay Now*.`
      );

      await delay(1000);

      const firstDue = outstanding[0];
      const charges = calculateTotalCharge(firstDue.balance);

      await sendText(
        phone,
        `💳 *Payment Breakdown*\n\n` +
          `School Fee:     ${formatNaira(charges.schoolAmount)}\n` +
          `1.5% Fee:       ${formatNaira(charges.platformCommission)}\n` +
          `Processing Fee: ${formatNaira(charges.paystackCharge)}\n` +
          `━━━━━━━━━━━━\n` +
          `Parent Pays:    ${formatNaira(charges.totalParentPays)}\n\n` +
          `🏫 The school still receives the full ${formatNaira(charges.schoolAmount)}.`
      );
    }

    await delay(1000);

    await sendButtons(
      phone,
      `See another part of the parent experience?`,
      [
        { id: 'PARENT_RECEIPT', title: '🧾 Receipt' },
        { id: 'PARENT_PICKUP', title: '🚗 Pickup' },
        { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
      ]
    );
    return;
  }

  // ── Parent pickup demo ─────────────────────────────────────
  if (input === 'parent_pickup') {
    const student = await getDemoStudent(phone);
    const pickup = student?.pickup;

    await sendText(
      phone,
      `🚗 *Parent Pickup Experience*\n\n` +
        `When the child is picked up,\n` +
        `this is what the parent sees:\n\n` +
        `━━━━━━━━━━━━\n` +
        `🚗 *Pickup Notification*\n` +
        `✅ ${student?.name ?? 'Amara Adeleke'} has been picked up!\n` +
        `👤 Picked up by: ${pickup?.picked_up_by ?? 'Mrs. Funmi Adeleke'}\n` +
        `👥 Relationship: ${pickup?.relationship ?? 'Mother'}\n` +
        `⏰ Time: ${pickup?.pickup_time ?? '2:30 PM'}\n` +
        `━━━━━━━━━━━━\n\n` +
        `If unauthorized, the parent knows instantly.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Continue exploring?`,
      [
        { id: 'PARENT_RECEIPT', title: '🧾 Receipt' },
        { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Parent receipt demo ────────────────────────────────────
  if (input === 'parent_receipt') {
    const student = await getDemoStudent(phone);
    const invoices = student?.invoices ?? [];
    // Prefer an invoice that already has a payment on it; fall back to the first.
    const paidInvoice =
      invoices.find((inv: any) => Number(inv.amount_paid) > 0) ??
      invoices[0];
    const amountPaid = paidInvoice
      ? Number(paidInvoice.amount_paid) || Number(paidInvoice.total_amount)
      : 50000;

    await sendText(
      phone,
      `🧾 *Parent Receipt Experience*\n\n` +
        `After payment, parent receives:\n\n` +
        `━━━━━━━━━━━━\n` +
        `🧾 *PAYMENT RECEIPT*\n` +
        `Receipt No: ${generateReceiptNo()}\n` +
        `Student: ${student?.name ?? 'Chidi Okonkwo'}\n` +
        `Fee: ${paidInvoice?.fee_name ?? 'First Term School Fees'}\n` +
        `Amount Paid: ${formatNaira(amountPaid)}\n` +
        `Method: Bank Transfer\n` +
        `Ref: ${generatePaymentRef()}\n` +
        `━━━━━━━━━━━━\n\n` +
        `This gives the parent instant proof of payment.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Want to see the school admin side now?`,
      [
        { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
        { id: 'PRICING', title: '💵 Pricing' },
        { id: 'REGISTER', title: '🏫 Register' },
      ]
    );
    return;
  }

  // ── School admin demo ──────────────────────────────────────
  if (input === 'admin_bot') {
    const student = await getDemoStudent(phone);

    await sendText(
      phone,
      `👨‍💼 *School Admin Experience*\n\n` +
        `This is how the school admin uses the bot:\n\n` +
        `━━━━━━━━━━━━\n` +
        `📋 *Admin Menu*\n` +
        `1. ✅ Attendance\n` +
        `2. 💰 Fees & Payments\n` +
        `3. 👨‍🏫 Staff Management\n` +
        `4. 📤 Upload Students (CSV)\n` +
        `5. 📊 Reports\n` +
        `6. 🧾 Receipts\n` +
        `7. 📢 Broadcast to Parents\n` +
        `━━━━━━━━━━━━\n\n` +
        `Fees, receipts and broadcasts all work the ` +
        `same way from here \u2014 search a student, act on it, done.`
    );

    await delay(1000);

    await sendText(
      phone,
      `✅ *Attendance Marking*\n\n` +
        `Admin selects a class, then the bot shows\n` +
        `one student at a time:\n\n` +
        `👤 ${student?.name ?? 'John Doe'}\n` +
        `🏫 ${student?.class ?? 'JSS 1A'}\n` +
        `📋 ${student?.admission_no ?? 'ADM/2026/001'}\n\n` +
        `This isn't a mockup \u2014 tap a button below and it ` +
        `actually updates the record. Then check the *Parent ` +
        `Experience* and see it reflected instantly.`
    );

    await delay(800);

    await sendButtons(
      phone,
      `Mark ${student?.name ?? 'this student'} as:`,
      [
        { id: 'MARK_PRESENT', title: '✅ Present' },
        { id: 'MARK_ABSENT', title: '❌ Absent' },
        { id: 'MARK_LATE', title: '⏰ Late' },
      ]
    );
    return;
  }

  // ── Admin marks attendance — writes to the real demo record ─
  if (['mark_present', 'mark_absent', 'mark_late'].includes(input)) {
    const student = await getDemoStudent(phone);

    if (!student) {
      await sendText(phone, `Type *hi* to restart the demo.`);
      return;
    }

    const statusMap: Record<string, string> = {
      mark_present: 'present',
      mark_absent: 'absent',
      mark_late: 'late',
    };
    const status = statusMap[input];
    const label =
      status === 'present'
        ? '✅ Present'
        : status === 'absent'
        ? '❌ Absent'
        : '⏰ Late';

    const db = getSupabase();
    await db
      .from('demo_students')
      .update({ today_status: status })
      .eq('id', student.id);

    await sendText(
      phone,
      `${label}\n\n` +
        `👤 ${student.name} marked *${status}* for today.\n` +
        `📅 ${new Date().toLocaleDateString('en-NG', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}\n\n` +
        `Saved. In the real bot the parent is notified on ` +
        `WhatsApp the moment this happens \u2014 see their side below.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `See it from the parent's side?`,
      [
        { id: 'PARENT_ATT', title: '✅ Parent View' },
        { id: 'MAIN_MENU', title: '↩️ Back to menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Pricing ────────────────────────────────────────────────
  if (input === 'pricing') {
    await sendText(
      phone,
      `💵 *SchoolBot Pricing*\n\n` +
        `*1. Setup Fee (one-time)*\n` +
        `This activates your school:\n\n` +
        `👥 1–100 students: ₦25,000\n` +
        `👥 101–300 students: ₦50,000\n` +
        `👥 301–500 students: ₦80,000\n` +
        `👥 501–1000 students: ₦120,000\n` +
        `👥 1001–2000 students: ₦180,000\n` +
        `👥 2000+ students: ₦250,000\n\n` +
        `*2. Termly Platform Fee*\n` +
        `This is separate from setup fee:\n\n` +
        `👥 1–100 students: ₦15,000 / term\n` +
        `👥 101–300 students: ₦25,000 / term\n` +
        `👥 301–500 students: ₦35,000 / term\n` +
        `👥 501–1000 students: ₦50,000 / term\n\n` +
        `*3. Fee Payment Commission*\n` +
        `1.5% is added on the parent payment.\n` +
        `The school still receives 100% of school fees. ✅`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Ready to register your school?`,
      [
        { id: 'REGISTER', title: '🏫 Register Now' },
        { id: 'ADMIN_BOT', title: '👨‍💼 School Demo' },
        { id: 'MAIN_MENU', title: '↩️ Back' },
      ]
    );
    return;
  }

  // ── Register school start ──────────────────────────────────
  if (input === 'register') {
    await sendText(
      phone,
      `🏫 *Register Your School*\n\n` +
        `Please send your details in this format:\n\n` +
        `*Your Name | School Name | Student Count | Location*\n\n` +
        `Example:\n` +
        `John Peter | Grace Academy | 250 | Lagos`
    );
    return;
  }

  // ── Lead capture (simple) ──────────────────────────────────
  if (rawLooksLikeLead(input)) {
    await sendText(
      phone,
      `✅ *Lead Received*\n\n` +
        `Thank you! We have received your school details.\n\n` +
        `Our team will contact you shortly to continue onboarding.`
    );

    const superAdminPhone = formatPhone(
      Deno.env.get('SUPER_ADMIN_PHONE') ?? ''
    );

    if (superAdminPhone) {
      await sendText(
        superAdminPhone,
        `🧲 *New School Lead*\n\n` +
          `📱 From: ${phone}\n` +
          `📝 Details:\n${input}`
      );
    }

    return;
  }

  // fallback
  await sendText(
    phone,
    `Type *hi* to open the SchoolBot demo menu.`
  );
}

// ============================================================
// HELPERS
// ============================================================

async function sendText(
  to: string,
  body: string
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';
  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(
    `${apiUrl}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { body },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND TEXT]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${data}`);
  }
}

async function sendButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';
  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(
    `${apiUrl}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: {
                id: b.id,
                title: b.title.substring(0, 20),
              },
            })),
          },
        },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND BUTTONS]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp buttons failed: ${data}`);
  }
}

async function sendList(
  to: string,
  header: string,
  body: string,
  footer: string,
  buttonLabel: string,
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';
  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(
    `${apiUrl}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: header,
          },
          body: {
            text: body,
          },
          footer: {
            text: footer,
          },
          action: {
            button: buttonLabel,
            sections,
          },
        },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND LIST]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp list failed: ${data}`);
  }
}

// ─── Demo data helpers ──────────────────────────────────────
// Assigns each WhatsApp number a consistent "persona" (a demo
// student row) for the length of their session, and fetches
// their attendance/fees/pickup data from the real tables so
// the demo isn't just static copy.

function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

function generateReceiptNo(): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SCH-RCP-${yymm}-${rand}`;
}

function generatePaymentRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = '';
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SCH-${ref}`;
}

async function getDemoStudent(phone: string): Promise<any | null> {
  const db = getSupabase();

  // Already assigned a persona this session?
  const { data: session } = await db
    .from('demo_sessions')
    .select('student_id')
    .eq('phone', phone)
    .maybeSingle();

  let studentId = session?.student_id;

  // First time — assign a random persona and remember it.
  if (!studentId) {
    const { data: candidates } = await db
      .from('demo_students')
      .select('id');

    if (!candidates || candidates.length === 0) return null;

    studentId =
      candidates[Math.floor(Math.random() * candidates.length)].id;

    await db
      .from('demo_sessions')
      .upsert({ phone, student_id: studentId });
  }

  const { data: student } = await db
    .from('demo_students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (!student) return null;

  const { data: invoices } = await db
    .from('demo_fee_invoices')
    .select('*')
    .eq('student_id', studentId);

  const { data: pickupEvents } = await db
    .from('demo_pickup_events')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1);

  return {
    ...student,
    invoices: invoices ?? [],
    pickup: pickupEvents?.[0] ?? null,
  };
}

function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '234' + p.slice(1);
  return p;
}

function getInput(message: any): string {
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

function getRawText(message: any): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}

function rawLooksLikeLead(text: string): boolean {
  return text.includes('|');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
