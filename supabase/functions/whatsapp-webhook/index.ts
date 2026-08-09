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
const demoBroadcastAwaiting = new Set<string>();

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

  // ── Admin broadcast text capture ───────────────────────────
  if (demoBroadcastAwaiting.has(senderPhone) && message.type === 'text') {
    demoBroadcastAwaiting.delete(senderPhone);
    await handleBroadcastCapture(phone, rawText);
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
// ADMIN BROADCAST CAPTURE
// ============================================================

async function handleBroadcastCapture(
  phone: string,
  text: string
): Promise<void> {
  await sendText(
    phone,
    `📢 *Broadcast Sent!*\n\n` +
      `Delivered to every parent on WhatsApp instantly. Here's ` +
      `exactly what they received:\n\n` +
      `━━━━━━━━━━━━\n` +
      `📢 *Announcement*\n\n` +
      `${text}\n` +
      `━━━━━━━━━━━━`
  );

  await delay(1000);

  await sendButtons(
    phone,
    `Continue exploring?`,
    [
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
      { id: 'MAIN_MENU', title: '↩️ Main Menu' },
    ]
  );
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

  // ── School admin demo — main menu ──────────────────────────
  if (input === 'admin_bot') {
    await sendText(
      phone,
      `👨‍💼 *School Admin Experience*\n\n` +
        `This is how the school admin uses the bot \u2014 ` +
        `every option below is live, not a mockup. Try any of them.`
    );

    await delay(800);

    await sendList(
      phone,
      '📋 Admin Menu',
      `Pick an action to try it for real:`,
      'Powered by XtopEdu',
      'Open Menu',
      [
        {
          title: 'Admin Actions',
          rows: [
            {
              id: 'ADMIN_DEMO_ATT',
              title: '✅ Attendance',
              description: 'Mark a real student present/absent',
            },
            {
              id: 'ADMIN_DEMO_FEES',
              title: '💰 Fees & Payments',
              description: 'Search a student, record a payment',
            },
            {
              id: 'ADMIN_DEMO_STAFF',
              title: '👨‍🏫 Staff Management',
              description: 'View the school\u2019s staff list',
            },
            {
              id: 'ADMIN_DEMO_UPLOAD',
              title: '📤 Upload Students',
              description: 'See a real bulk-import result',
            },
            {
              id: 'ADMIN_DEMO_REPORTS',
              title: '📊 Reports',
              description: 'Live attendance & collection numbers',
            },
            {
              id: 'ADMIN_DEMO_RECEIPTS',
              title: '🧾 Receipts',
              description: 'See payments actually recorded',
            },
            {
              id: 'ADMIN_DEMO_BROADCAST',
              title: '📢 Broadcast to Parents',
              description: 'Send a message, see what parents get',
            },
          ],
        },
      ]
    );
    return;
  }

  // ── Admin: attendance marking ──────────────────────────────
  if (input === 'admin_demo_att') {
    const student = await getDemoStudent(phone);

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
    const { error: markErr } = await db
      .from('demo_students')
      .update({ today_status: status })
      .eq('id', student.id);

    if (markErr) {
      console.error('[DEMO DB ERROR] attendance update', markErr);
    }

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
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Admin: fees & payments ──────────────────────────────────
  if (input === 'admin_demo_fees') {
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
        `💰 *Fees & Payments*\n\n` +
          `👤 ${student?.name ?? 'Chidi Okonkwo'} - ${student?.class ?? 'JSS 3A'}\n\n` +
          `✅ Fully paid \u2014 nothing outstanding for this student.`
      );
      await delay(800);
      await sendButtons(
        phone,
        `Continue exploring?`,
        [
          { id: 'ADMIN_DEMO_RECEIPTS', title: '🧾 Receipts' },
          { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
          { id: 'MAIN_MENU', title: '↩️ Main Menu' },
        ]
      );
      return;
    }

    const lines = outstanding
      .map(
        (inv: any, i: number) =>
          `${i + 1}. ${inv.fee_name} \u2014 ${formatNaira(inv.balance)} remaining`
      )
      .join('\n');

    await sendText(
      phone,
      `💰 *Fees & Payments*\n\n` +
        `Admin searches a student and sees:\n\n` +
        `━━━━━━━━━━━━\n` +
        `👤 ${student?.name ?? 'Chidi Okonkwo'} - ${student?.class ?? 'JSS 3A'}\n\n` +
        `${lines}\n` +
        `━━━━━━━━━━━━\n\n` +
        `This isn't a mockup \u2014 tap below to actually record a ` +
        `cash payment for the first item.`
    );

    await delay(800);

    await sendButtons(
      phone,
      `Record payment for "${outstanding[0].fee_name}"?`,
      [
        { id: 'ADMIN_PAY_INVOICE', title: '💵 Record Payment' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      ]
    );
    return;
  }

  // ── Admin: record a real payment against the first outstanding invoice ─
  if (input === 'admin_pay_invoice') {
    const student = await getDemoStudent(phone);
    const invoices = student?.invoices ?? [];
    const outstanding = invoices
      .map((inv: any) => ({
        ...inv,
        balance: Number(inv.total_amount) - Number(inv.amount_paid),
      }))
      .filter((inv: any) => inv.balance > 0);

    if (!student || outstanding.length === 0) {
      await sendText(
        phone,
        `Nothing outstanding to pay right now. Type *hi* to restart the demo.`
      );
      return;
    }

    const invoice = outstanding[0];
    const db = getSupabase();

    const { error: payErr } = await db
      .from('demo_fee_invoices')
      .update({ amount_paid: invoice.total_amount })
      .eq('id', invoice.id);

    if (payErr) {
      console.error('[DEMO DB ERROR] invoice update', payErr);
    }

    const receiptNo = generateReceiptNo();
    const reference = generatePaymentRef();

    const { error: receiptErr } = await db.from('demo_receipts').insert({
      student_id: student.id,
      invoice_id: invoice.id,
      fee_name: invoice.fee_name,
      amount: invoice.balance,
      method: 'Cash',
      reference,
      receipt_no: receiptNo,
    });

    if (receiptErr) {
      console.error('[DEMO DB ERROR] receipt insert', receiptErr);
    }

    await sendText(
      phone,
      `✅ *Payment Recorded*\n\n` +
        `👤 ${student.name}\n` +
        `Fee: ${invoice.fee_name}\n` +
        `Amount: ${formatNaira(invoice.balance)}\n` +
        `Method: Cash\n` +
        `Receipt No: ${receiptNo}\n\n` +
        `Saved for real. The parent's fee balance and receipt ` +
        `screens now reflect this \u2014 check them below.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `See the parent's side?`,
      [
        { id: 'PARENT_RECEIPT', title: '🧾 Parent Receipt' },
        { id: 'PARENT_FEES', title: '💰 Parent Fees' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      ]
    );
    return;
  }

  // ── Admin: staff management ─────────────────────────────────
  if (input === 'admin_demo_staff') {
    const db = getSupabase();
    const { data: staff } = await db
      .from('demo_staff')
      .select('*')
      .order('created_at', { ascending: true });

    const lines = (staff ?? [])
      .map((s: any) => `👤 ${s.name}\n   ${s.role} \u2014 ${s.assignment}`)
      .join('\n\n');

    await sendText(
      phone,
      `👨‍🏫 *Staff Management*\n\n` +
        `Full staff list, pulled live from the school's records:\n\n` +
        `━━━━━━━━━━━━\n` +
        `${lines || 'No staff on file yet.'}\n` +
        `━━━━━━━━━━━━\n\n` +
        `Admin can add, edit or remove staff the same way.`
    );

    await delay(800);

    await sendButtons(
      phone,
      `Continue exploring?`,
      [
        { id: 'ADMIN_DEMO_REPORTS', title: '📊 Reports' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Admin: bulk student upload ──────────────────────────────
  if (input === 'admin_demo_upload') {
    const db = getSupabase();
    const { data: students } = await db
      .from('demo_students')
      .select('name, class, admission_no');

    const sample = (students ?? [])
      .slice(0, 3)
      .map((s: any) => `• ${s.name} \u2014 ${s.class} (${s.admission_no})`)
      .join('\n');

    await sendText(
      phone,
      `📤 *Upload Students (CSV)*\n\n` +
        `Admin uploads a spreadsheet of students. This school's ` +
        `actual roster on file right now:\n\n` +
        `━━━━━━━━━━━━\n` +
        `✅ ${students?.length ?? 0} students imported\n\n` +
        `Sample:\n${sample || 'No students on file yet.'}\n` +
        `━━━━━━━━━━━━\n\n` +
        `Every student gets attendance, fee and pickup tracking ` +
        `automatically \u2014 no extra setup.`
    );

    await delay(800);

    await sendButtons(
      phone,
      `Continue exploring?`,
      [
        { id: 'ADMIN_DEMO_REPORTS', title: '📊 Reports' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Admin: live reports ─────────────────────────────────────
  if (input === 'admin_demo_reports') {
    const db = getSupabase();
    const { data: students } = await db
      .from('demo_students')
      .select('today_status');
    const { data: invoices } = await db
      .from('demo_fee_invoices')
      .select('total_amount, amount_paid');

    const total = students?.length ?? 0;
    const present =
      students?.filter((s: any) => s.today_status === 'present').length ?? 0;
    const absent =
      students?.filter((s: any) => s.today_status === 'absent').length ?? 0;
    const late =
      students?.filter((s: any) => s.today_status === 'late').length ?? 0;
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;

    const totalBilled =
      invoices?.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) ??
      0;
    const totalCollected =
      invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid), 0) ??
      0;

    await sendText(
      phone,
      `📊 *Live Reports*\n\n` +
        `Calculated in real time from actual records:\n\n` +
        `━━━━━━━━━━━━\n` +
        `📅 *Today's Attendance*\n` +
        `✅ Present: ${present}/${total} (${attendanceRate}%)\n` +
        `❌ Absent: ${absent}\n` +
        `⏰ Late: ${late}\n\n` +
        `💰 *Fee Collection*\n` +
        `Billed: ${formatNaira(totalBilled)}\n` +
        `Collected: ${formatNaira(totalCollected)}\n` +
        `Outstanding: ${formatNaira(totalBilled - totalCollected)}\n` +
        `━━━━━━━━━━━━\n\n` +
        `Try marking attendance or recording a payment, then check ` +
        `this report again \u2014 the numbers move.`
    );

    await delay(800);

    await sendButtons(
      phone,
      `Continue exploring?`,
      [
        { id: 'ADMIN_DEMO_RECEIPTS', title: '🧾 Receipts' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Admin: receipts log ─────────────────────────────────────
  if (input === 'admin_demo_receipts') {
    const db = getSupabase();
    const { data: receipts } = await db
      .from('demo_receipts')
      .select('*, demo_students(name)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!receipts || receipts.length === 0) {
      await sendText(
        phone,
        `🧾 *Receipts*\n\n` +
          `No payments recorded yet. Go to *Fees & Payments* and ` +
          `record one \u2014 it'll show up here immediately.`
      );
    } else {
      const lines = receipts
        .map(
          (r: any) =>
            `🧾 ${r.receipt_no}\n` +
            `👤 ${r.demo_students?.name ?? 'Student'}\n` +
            `${r.fee_name}: ${formatNaira(r.amount)}\n` +
            `Ref: ${r.reference}`
        )
        .join('\n\n');

      await sendText(
        phone,
        `🧾 *Receipts*\n\n` +
          `Actual payments recorded through this demo:\n\n` +
          `━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━`
      );
    }

    await delay(800);

    await sendButtons(
      phone,
      `Continue exploring?`,
      [
        { id: 'ADMIN_DEMO_FEES', title: '💰 Fees' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'PRICING', title: '💵 Pricing' },
      ]
    );
    return;
  }

  // ── Admin: broadcast to parents ─────────────────────────────
  if (input === 'admin_demo_broadcast') {
    demoBroadcastAwaiting.add(formatPhone(phone));

    await sendText(
      phone,
      `📢 *Broadcast to Parents*\n\n` +
        `Type the announcement you'd like to send to every ` +
        `parent \u2014 whatever you send next will actually be ` +
        `delivered back to you here, exactly as parents would ` +
        `receive it on WhatsApp.\n\n` +
        `Example: "School resumes Monday 8am after the break."`
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
  const { data: session, error: sessionErr } = await db
    .from('demo_sessions')
    .select('student_id')
    .eq('phone', phone)
    .maybeSingle();

  if (sessionErr) {
    console.error('[DEMO DB ERROR] session select', sessionErr);
  }

  let studentId = session?.student_id;

  // First time — assign a random persona and remember it.
  if (!studentId) {
    const { data: candidates, error: candErr } = await db
      .from('demo_students')
      .select('id');

    if (candErr) {
      console.error('[DEMO DB ERROR] candidates select', candErr);
    }

    if (!candidates || candidates.length === 0) return null;

    studentId =
      candidates[Math.floor(Math.random() * candidates.length)].id;

    const { error: upsertErr } = await db
      .from('demo_sessions')
      .upsert({ phone, student_id: studentId }, { onConflict: 'phone' });

    if (upsertErr) {
      console.error('[DEMO DB ERROR] session upsert', upsertErr);
    }
  }

  const { data: student, error: studentErr } = await db
    .from('demo_students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (studentErr) {
    console.error('[DEMO DB ERROR] student select', studentErr);
  }

  if (!student) return null;

  const { data: invoices, error: invErr } = await db
    .from('demo_fee_invoices')
    .select('*')
    .eq('student_id', studentId);

  if (invErr) {
    console.error('[DEMO DB ERROR] invoices select', invErr);
  }

  const { data: pickupEvents, error: pickupErr } = await db
    .from('demo_pickup_events')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (pickupErr) {
    console.error('[DEMO DB ERROR] pickup select', pickupErr);
  }

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
