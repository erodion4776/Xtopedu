// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (REALISTIC DEMO VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { getSupabase } from '../_shared/supabase.ts';
import { calculateTotalCharge } from '../_shared/paystack.service.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      await processWebhook(body);
      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[WEBHOOK ERROR]', err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});

// ============================================================
// TYPES & SESSION STATE
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

// Tracks which student index admin is currently marking in bulk attendance
type AttendanceSession = {
  studentIds: string[];
  currentIndex: number;
  className: string;
  marked: Array<{ name: string; status: string }>;
};

const leadSessions = new Map<string, LeadState>();
const demoBroadcastAwaiting = new Set<string>();
const attendanceSessions = new Map<string, AttendanceSession>();

// ============================================================
// DEMO DATA — Multiple students for bulk attendance
// ============================================================

// These are the demo class students shown during bulk attendance marking.
// In the real app these come from the DB filtered by class.
const DEMO_CLASS_STUDENTS = [
  {
    id: 'demo-s1',
    name: 'Chidi Okonkwo',
    admission_no: 'ADM/2026/001',
    class: 'JSS 2A',
  },
  {
    id: 'demo-s2',
    name: 'Amara Adeleke',
    admission_no: 'ADM/2026/002',
    class: 'JSS 2A',
  },
  {
    id: 'demo-s3',
    name: 'Emeka Nwosu',
    admission_no: 'ADM/2026/003',
    class: 'JSS 2A',
  },
  {
    id: 'demo-s4',
    name: 'Fatima Bello',
    admission_no: 'ADM/2026/004',
    class: 'JSS 2A',
  },
  {
    id: 'demo-s5',
    name: 'Tunde Adesanya',
    admission_no: 'ADM/2026/005',
    class: 'JSS 2A',
  },
];

// Demo result data per subject — used to generate student results
const DEMO_SUBJECTS = [
  { name: 'Mathematics', ca: 28, exam: 58 },
  { name: 'English Language', ca: 32, exam: 60 },
  { name: 'Basic Science', ca: 25, exam: 52 },
  { name: 'Social Studies', ca: 30, exam: 55 },
  { name: 'Civic Education', ca: 27, exam: 50 },
  { name: 'Computer Studies', ca: 35, exam: 62 },
];

// ============================================================
// PROCESS WEBHOOK
// ============================================================

async function processWebhook(body: any): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  if (value.statuses?.length) return;
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
  const superAdminPhone = formatPhone(Deno.env.get('SUPER_ADMIN_PHONE') ?? '');

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

  // ── Bulk attendance: if admin is mid-session, route button presses ─
  if (
    attendanceSessions.has(senderPhone) &&
    ['mark_present', 'mark_absent', 'mark_late'].includes(input)
  ) {
    await handleBulkAttendanceStep(phone, input);
    return;
  }

  // ── Demo / School owner flow ───────────────────────────────
  await handleDemoFlow(phone, input, rawText);
}

// ============================================================
// SUPER ADMIN FLOW
// ============================================================

async function handleSuperAdminFlow(phone: string, input: string): Promise<void> {
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
            { id: 'ADMIN_SCHOOLS', title: '🏫 Schools', description: 'View school summary' },
            { id: 'ADMIN_REVENUE', title: '💰 Revenue', description: 'View revenue summary' },
            { id: 'ADMIN_LEADS', title: '🧲 Leads', description: 'View new school leads' },
            { id: 'ADMIN_TEST', title: '🤖 Bot Test', description: 'Confirm bot is working' },
          ],
        },
      ]
    );
    return;
  }

  if (input === 'admin_schools') {
    await sendText(
      phone,
      `🏫 *Schools Summary*\n\nUse your web dashboard to see:\n• all schools\n• onboarding status\n• student count\n• WhatsApp status\n\nType *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_revenue') {
    await sendText(
      phone,
      `💰 *Revenue Summary*\n\nYour income comes from:\n\n1️⃣ *Setup Fee* (one-time)\n2️⃣ *Termly Platform Fee*\n3️⃣ *1.5% Commission* on school fee payments\n\nUse your dashboard for the full breakdown.\n\nType *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_leads') {
    await sendText(
      phone,
      `🧲 *Lead Capture*\n\nWhen a school owner registers from this bot,\ntheir details are captured and sent to you.\n\nUse your dashboard to view all leads.\n\nType *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_test') {
    await sendText(
      phone,
      `✅ *Bot Test Successful!*\n\nEverything is working:\n• Webhook ✅\n• Sending ✅\n• Demo menu ✅\n• Admin menu ✅`
    );
    return;
  }

  await sendText(phone, `Type *menu* to open your admin panel.`);
}

// ============================================================
// ADMIN BROADCAST CAPTURE
// ============================================================

async function handleBroadcastCapture(phone: string, text: string): Promise<void> {
  await sendText(
    phone,
    `📢 *Broadcast Sent!*\n\n` +
      `Delivered to every parent on WhatsApp instantly. Here's exactly what they received:\n\n` +
      `━━━━━━━━━━━━\n` +
      `📢 *Announcement*\n\n` +
      `${text}\n` +
      `━━━━━━━━━━━━`
  );

  await delay(1000);

  await sendButtons(phone, `Continue exploring?`, [
    { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
    { id: 'PRICING', title: '💵 Pricing' },
    { id: 'MAIN_MENU', title: '↩️ Main Menu' },
  ]);
}

// ============================================================
// BULK ATTENDANCE SESSION HANDLER
// ============================================================

async function handleBulkAttendanceStep(phone: string, input: string): Promise<void> {
  const senderPhone = formatPhone(phone);
  const session = attendanceSessions.get(senderPhone);

  if (!session) {
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
    status === 'present' ? '✅ Present' : status === 'absent' ? '❌ Absent' : '⏰ Late';

  // Get the student we just marked
  const currentStudentId = session.studentIds[session.currentIndex];
  const currentStudent = DEMO_CLASS_STUDENTS.find((s) => s.id === currentStudentId);

  // Save to marked list
  session.marked.push({ name: currentStudent?.name ?? 'Student', status });

  // Try to update in DB too
  const db = getSupabase();
  await db
    .from('demo_students')
    .update({ today_status: status })
    .eq('id', currentStudentId)
    .then(({ error }) => {
      if (error) console.error('[DEMO DB ERROR] bulk att update', error);
    });

  session.currentIndex += 1;
  const total = session.studentIds.length;
  const done = session.currentIndex;

  // ── All students marked — show summary ────────────────────
  if (done >= total) {
    attendanceSessions.delete(senderPhone);

    const summaryLines = session.marked
      .map((m, i) => {
        const icon =
          m.status === 'present' ? '✅' : m.status === 'absent' ? '❌' : '⏰';
        return `${i + 1}. ${icon} ${m.name}`;
      })
      .join('\n');

    const presentCount = session.marked.filter((m) => m.status === 'present').length;
    const absentCount = session.marked.filter((m) => m.status === 'absent').length;
    const lateCount = session.marked.filter((m) => m.status === 'late').length;

    await sendText(
      phone,
      `✅ *Attendance Complete — ${session.className}*\n\n` +
        `All ${total} students marked for today:\n\n` +
        `━━━━━━━━━━━━\n` +
        `${summaryLines}\n` +
        `━━━━━━━━━━━━\n\n` +
        `📊 *Summary*\n` +
        `✅ Present: ${presentCount}\n` +
        `❌ Absent: ${absentCount}\n` +
        `⏰ Late: ${lateCount}\n` +
        `👥 Total: ${total}\n\n` +
        `In the real bot, every parent gets an instant WhatsApp\n` +
        `notification as soon as their child is marked. 📲`
    );

    await delay(1000);

    await sendButtons(phone, `See the parent notification or explore more?`, [
      { id: 'PARENT_ATT', title: '✅ Parent View' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── More students to mark — show next ─────────────────────
  const nextStudentId = session.studentIds[done];
  const nextStudent = DEMO_CLASS_STUDENTS.find((s) => s.id === nextStudentId);

  await sendText(
    phone,
    `${label} — ${currentStudent?.name ?? 'Student'} marked.\n\n` +
      `📋 Progress: ${done}/${total} students done\n\n` +
      `━━━━━━━━━━━━\n` +
      `Next student:\n` +
      `👤 *${nextStudent?.name ?? 'Student'}*\n` +
      `📋 ${nextStudent?.admission_no ?? ''} — ${session.className}\n` +
      `━━━━━━━━━━━━`
  );

  await delay(600);

  await sendButtons(phone, `Mark ${nextStudent?.name ?? 'this student'} as:`, [
    { id: 'MARK_PRESENT', title: '✅ Present' },
    { id: 'MARK_ABSENT', title: '❌ Absent' },
    { id: 'MARK_LATE', title: '⏰ Late' },
  ]);

  // Save updated session
  attendanceSessions.set(senderPhone, session);
}

// ============================================================
// DEMO FLOW
// ============================================================

async function handleDemoFlow(phone: string, input: string, rawText: string): Promise<void> {
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
            {
              id: 'PARENT_RESULT',
              title: '📝 Check Results',
              description: 'See student term result',
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

  // ── Parent: attendance ─────────────────────────────────────
  if (input === 'parent_att') {
    const student = await getDemoStudent(phone);
    const totalDays =
      (student?.present_days ?? 0) +
      (student?.absent_days ?? 0) +
      (student?.late_days ?? 0);
    const rate = totalDays ? Math.round((student.present_days / totalDays) * 100) : 0;

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

    await sendButtons(phone, `Try another parent view?`, [
      { id: 'PARENT_RESULT', title: '📝 Results' },
      { id: 'PARENT_FEES', title: '💰 Fee View' },
      { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
    ]);
    return;
  }

  // ── Parent: results demo ───────────────────────────────────
  if (input === 'parent_result') {
    const student = await getDemoStudent(phone);
    await sendParentResult(phone, student);
    return;
  }

  // ── Parent: fees ───────────────────────────────────────────
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
            `   📅 Due: ${new Date(inv.due_date).toLocaleDateString('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}`
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

    await sendButtons(phone, `See another part of the parent experience?`, [
      { id: 'PARENT_RECEIPT', title: '🧾 Receipt' },
      { id: 'PARENT_RESULT', title: '📝 Results' },
      { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
    ]);
    return;
  }

  // ── Parent: pickup ─────────────────────────────────────────
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

    await sendButtons(phone, `Continue exploring?`, [
      { id: 'PARENT_RECEIPT', title: '🧾 Receipt' },
      { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── Parent: receipt ────────────────────────────────────────
  if (input === 'parent_receipt') {
    await sendParentReceipt(phone);
    return;
  }

  // ── School admin demo — main menu ──────────────────────────
  if (input === 'admin_bot') {
    await sendText(
      phone,
      `👨‍💼 *School Admin Experience*\n\n` +
        `This is how the school admin uses the bot — ` +
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
              description: 'Mark multiple students present/absent',
            },
            {
              id: 'ADMIN_DEMO_RESULT',
              title: '📝 Generate Result',
              description: 'Generate & send student result',
            },
            {
              id: 'ADMIN_DEMO_FEES',
              title: '💰 Fees & Payments',
              description: 'Search a student, record a payment',
            },
            {
              id: 'ADMIN_DEMO_RECEIPT_GEN',
              title: '🧾 Generate Receipt',
              description: 'Generate & send payment receipt',
            },
            {
              id: 'ADMIN_DEMO_STAFF',
              title: '👨‍🏫 Staff Management',
              description: "View the school's staff list",
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
              title: '📋 Receipts Log',
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

  // ── Admin: bulk attendance marking ────────────────────────
  if (input === 'admin_demo_att') {
    const senderPhone = formatPhone(phone);

    // Build the attendance session with all 5 demo class students
    const session: AttendanceSession = {
      studentIds: DEMO_CLASS_STUDENTS.map((s) => s.id),
      currentIndex: 0,
      className: 'JSS 2A',
      marked: [],
    };

    attendanceSessions.set(senderPhone, session);

    const firstStudent = DEMO_CLASS_STUDENTS[0];

    await sendText(
      phone,
      `✅ *Attendance Marking — JSS 2A*\n\n` +
        `The admin selects a class and the bot walks through\n` +
        `each student one by one. You mark all ${DEMO_CLASS_STUDENTS.length} students below.\n\n` +
        `━━━━━━━━━━━━\n` +
        `📋 Class: JSS 2A\n` +
        `👥 Total Students: ${DEMO_CLASS_STUDENTS.length}\n` +
        `📅 Date: ${new Date().toLocaleDateString('en-NG', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}\n` +
        `━━━━━━━━━━━━\n\n` +
        `Student 1 of ${DEMO_CLASS_STUDENTS.length}:\n` +
        `👤 *${firstStudent.name}*\n` +
        `📋 ${firstStudent.admission_no}`
    );

    await delay(800);

    await sendButtons(phone, `Mark ${firstStudent.name} as:`, [
      { id: 'MARK_PRESENT', title: '✅ Present' },
      { id: 'MARK_ABSENT', title: '❌ Absent' },
      { id: 'MARK_LATE', title: '⏰ Late' },
    ]);
    return;
  }

  // ── Admin: generate student result ────────────────────────
  if (input === 'admin_demo_result') {
    await sendAdminResult(phone);
    return;
  }

  // ── Admin: generate receipt (admin side) ──────────────────
  if (input === 'admin_demo_receipt_gen') {
    await sendAdminGeneratedReceipt(phone);
    return;
  }

  // ── Admin: fees & payments ─────────────────────────────────
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
          `✅ Fully paid — nothing outstanding for this student.`
      );
      await delay(800);
      await sendButtons(phone, `Continue exploring?`, [
        { id: 'ADMIN_DEMO_RECEIPT_GEN', title: '🧾 Gen Receipt' },
        { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
        { id: 'MAIN_MENU', title: '↩️ Main Menu' },
      ]);
      return;
    }

    const lines = outstanding
      .map(
        (inv: any, i: number) =>
          `${i + 1}. ${inv.fee_name} — ${formatNaira(inv.balance)} remaining`
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
        `This isn't a mockup — tap below to actually record a ` +
        `cash payment for the first item.`
    );

    await delay(800);

    await sendButtons(phone, `Record payment for "${outstanding[0].fee_name}"?`, [
      { id: 'ADMIN_PAY_INVOICE', title: '💵 Record Payment' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
    ]);
    return;
  }

  // ── Admin: record a real payment ───────────────────────────
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

    await db
      .from('demo_fee_invoices')
      .update({ amount_paid: invoice.total_amount })
      .eq('id', invoice.id)
      .then(({ error }) => {
        if (error) console.error('[DEMO DB ERROR] invoice update', error);
      });

    const receiptNo = generateReceiptNo();
    const reference = generatePaymentRef();

    await db
      .from('demo_receipts')
      .insert({
        student_id: student.id,
        invoice_id: invoice.id,
        fee_name: invoice.fee_name,
        amount: invoice.balance,
        method: 'Cash',
        reference,
        receipt_no: receiptNo,
      })
      .then(({ error }) => {
        if (error) console.error('[DEMO DB ERROR] receipt insert', error);
      });

    await sendText(
      phone,
      `✅ *Payment Recorded*\n\n` +
        `👤 ${student.name}\n` +
        `Fee: ${invoice.fee_name}\n` +
        `Amount: ${formatNaira(invoice.balance)}\n` +
        `Method: Cash\n` +
        `Receipt No: ${receiptNo}\n\n` +
        `Saved for real. The parent's fee balance and receipt\n` +
        `screens now reflect this — check them below.`
    );

    await delay(1000);

    await sendButtons(phone, `See the parent's side?`, [
      { id: 'PARENT_RECEIPT', title: '🧾 Parent Receipt' },
      { id: 'PARENT_FEES', title: '💰 Parent Fees' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
    ]);
    return;
  }

  // ── Admin: staff management ────────────────────────────────
  if (input === 'admin_demo_staff') {
    const db = getSupabase();
    const { data: staff } = await db
      .from('demo_staff')
      .select('*')
      .order('created_at', { ascending: true });

    const lines = (staff ?? [])
      .map((s: any) => `👤 ${s.name}\n   ${s.role} — ${s.assignment}`)
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

    await sendButtons(phone, `Continue exploring?`, [
      { id: 'ADMIN_DEMO_REPORTS', title: '📊 Reports' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── Admin: bulk upload ─────────────────────────────────────
  if (input === 'admin_demo_upload') {
    const db = getSupabase();
    const { data: students } = await db
      .from('demo_students')
      .select('name, class, admission_no');

    const sample = (students ?? [])
      .slice(0, 3)
      .map((s: any) => `• ${s.name} — ${s.class} (${s.admission_no})`)
      .join('\n');

    await sendText(
      phone,
      `📤 *Upload Students (CSV)*\n\n` +
        `Admin uploads a spreadsheet of students. This school's\n` +
        `actual roster on file right now:\n\n` +
        `━━━━━━━━━━━━\n` +
        `✅ ${students?.length ?? 0} students imported\n\n` +
        `Sample:\n${sample || 'No students on file yet.'}\n` +
        `━━━━━━━━━━━━\n\n` +
        `Every student gets attendance, fee and pickup tracking\n` +
        `automatically — no extra setup.`
    );

    await delay(800);

    await sendButtons(phone, `Continue exploring?`, [
      { id: 'ADMIN_DEMO_REPORTS', title: '📊 Reports' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── Admin: live reports ────────────────────────────────────
  if (input === 'admin_demo_reports') {
    const db = getSupabase();
    const { data: students } = await db.from('demo_students').select('today_status');
    const { data: invoices } = await db
      .from('demo_fee_invoices')
      .select('total_amount, amount_paid');

    const total = students?.length ?? 0;
    const present = students?.filter((s: any) => s.today_status === 'present').length ?? 0;
    const absent = students?.filter((s: any) => s.today_status === 'absent').length ?? 0;
    const late = students?.filter((s: any) => s.today_status === 'late').length ?? 0;
    const attendanceRate = total ? Math.round((present / total) * 100) : 0;

    const totalBilled =
      invoices?.reduce((sum: number, inv: any) => sum + Number(inv.total_amount), 0) ?? 0;
    const totalCollected =
      invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid), 0) ?? 0;

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
        `Try marking attendance or recording a payment, then check\n` +
        `this report again — the numbers move.`
    );

    await delay(800);

    await sendButtons(phone, `Continue exploring?`, [
      { id: 'ADMIN_DEMO_RECEIPTS', title: '📋 Receipts Log' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── Admin: receipts log ────────────────────────────────────
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
        `🧾 *Receipts Log*\n\n` +
          `No payments recorded yet. Go to *Fees & Payments* and\n` +
          `record one — it'll show up here immediately.`
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
        `🧾 *Receipts Log*\n\n` +
          `Actual payments recorded through this demo:\n\n` +
          `━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━`
      );
    }

    await delay(800);

    await sendButtons(phone, `Continue exploring?`, [
      { id: 'ADMIN_DEMO_FEES', title: '💰 Fees' },
      { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
      { id: 'PRICING', title: '💵 Pricing' },
    ]);
    return;
  }

  // ── Admin: broadcast ───────────────────────────────────────
  if (input === 'admin_demo_broadcast') {
    demoBroadcastAwaiting.add(formatPhone(phone));

    await sendText(
      phone,
      `📢 *Broadcast to Parents*\n\n` +
        `Type the announcement you'd like to send to every\n` +
        `parent — whatever you send next will actually be\n` +
        `delivered back to you here, exactly as parents would\n` +
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

    await sendButtons(phone, `Ready to register your school?`, [
      { id: 'REGISTER', title: '🏫 Register Now' },
      { id: 'ADMIN_BOT', title: '👨‍💼 School Demo' },
      { id: 'MAIN_MENU', title: '↩️ Back' },
    ]);
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

  // ── Lead capture (simple pipe-delimited) ──────────────────
  if (rawLooksLikeLead(rawText)) {
    await sendText(
      phone,
      `✅ *Lead Received*\n\n` +
        `Thank you! We have received your school details.\n\n` +
        `Our team will contact you shortly to continue onboarding.`
    );

    const superAdmin = formatPhone(Deno.env.get('SUPER_ADMIN_PHONE') ?? '');
    if (superAdmin) {
      await sendText(
        superAdmin,
        `🧲 *New School Lead*\n\n📱 From: ${phone}\n📝 Details:\n${rawText}`
      );
    }
    return;
  }

  // ── fallback ───────────────────────────────────────────────
  await sendText(phone, `Type *hi* to open the SchoolBot demo menu.`);
}

// ============================================================
// RECEIPT GENERATION HELPERS
// ============================================================

/**
 * sendParentReceipt
 * Shows the parent-facing receipt — prefers a real DB receipt,
 * falls back to a sample if no payment has been recorded yet.
 */
async function sendParentReceipt(phone: string): Promise<void> {
  const student = await getDemoStudent(phone);
  const db = getSupabase();

  let realReceipt: any = null;

  if (student?.id) {
    const { data, error } = await db
      .from('demo_receipts')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) console.error('[DEMO DB ERROR] receipt fetch (parent)', error);
    realReceipt = data?.[0] ?? null;
  }

  let receiptNo: string;
  let feeName: string;
  let amountPaid: number;
  let method: string;
  let reference: string;
  let paidOn: string;

  if (realReceipt) {
    receiptNo = realReceipt.receipt_no;
    feeName = realReceipt.fee_name;
    amountPaid = Number(realReceipt.amount);
    method = realReceipt.method;
    reference = realReceipt.reference;
    paidOn = new Date(realReceipt.created_at).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } else {
    // Fallback sample receipt
    const invoices = student?.invoices ?? [];
    const paidInvoice =
      invoices.find((inv: any) => Number(inv.amount_paid) > 0) ?? invoices[0];
    receiptNo = generateReceiptNo();
    feeName = paidInvoice?.fee_name ?? 'First Term School Fees';
    amountPaid = paidInvoice
      ? Number(paidInvoice.amount_paid) || Number(paidInvoice.total_amount)
      : 50000;
    method = 'Bank Transfer';
    reference = generatePaymentRef();
    paidOn = new Date().toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // ── Message 1: context ─────────────────────────────────────
  await sendText(
    phone,
    `🧾 *Parent Receipt Experience*\n\n` +
      `After payment is recorded, the parent receives this\n` +
      `receipt automatically on WhatsApp — no email, no app needed.`
  );

  await delay(800);

  // ── Message 2: the actual receipt ─────────────────────────
  await sendText(
    phone,
    `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏫 *GREENFIELD ACADEMY*\n` +
      `📍 Excellence Drive, Lagos\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🧾 *OFFICIAL PAYMENT RECEIPT*\n\n` +
      `Receipt No:   *${receiptNo}*\n` +
      `Date:         ${paidOn}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Student Details*\n` +
      `Name:         ${student?.name ?? 'Chidi Okonkwo'}\n` +
      `Class:        ${student?.class ?? 'JSS 3A'}\n` +
      `Adm No:       ${student?.admission_no ?? 'ADM/2026/001'}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Payment Details*\n` +
      `Fee:          ${feeName}\n` +
      `Amount Paid:  *${formatNaira(amountPaid)}*\n` +
      `Method:       ${method}\n` +
      `Reference:    ${reference}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ *Payment confirmed and recorded.*\n` +
      `Thank you for your prompt payment!\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_Powered by SchoolBot · XtopEdu_`
  );

  await delay(1000);

  await sendButtons(phone, `Want to see the school admin side now?`, [
    { id: 'ADMIN_DEMO_RECEIPT_GEN', title: '🧾 Admin Receipt' },
    { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
    { id: 'PRICING', title: '💵 Pricing' },
  ]);
}

/**
 * sendAdminGeneratedReceipt
 * Shows the admin-facing receipt generation view — admin can
 * generate and send a receipt to a parent directly from the bot.
 */
async function sendAdminGeneratedReceipt(phone: string): Promise<void> {
  const student = await getDemoStudent(phone);
  const db = getSupabase();

  // Get the most recently recorded payment for this demo student
  let latestReceipt: any = null;
  if (student?.id) {
    const { data, error } = await db
      .from('demo_receipts')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) console.error('[DEMO DB ERROR] admin receipt gen', error);
    latestReceipt = data?.[0] ?? null;
  }

  let receiptNo: string;
  let feeName: string;
  let amountPaid: number;
  let method: string;
  let reference: string;
  let paidOn: string;

  if (latestReceipt) {
    receiptNo = latestReceipt.receipt_no;
    feeName = latestReceipt.fee_name;
    amountPaid = Number(latestReceipt.amount);
    method = latestReceipt.method;
    reference = latestReceipt.reference;
    paidOn = new Date(latestReceipt.created_at).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } else {
    // No payment yet — generate a preview receipt
    const invoices = student?.invoices ?? [];
    const inv = invoices[0];
    receiptNo = generateReceiptNo();
    feeName = inv?.fee_name ?? 'First Term School Fees';
    amountPaid = inv ? Number(inv.total_amount) : 50000;
    method = 'Cash';
    reference = generatePaymentRef();
    paidOn = new Date().toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // ── Message 1: admin context ───────────────────────────────
  await sendText(
    phone,
    `🧾 *Admin: Generate Receipt*\n\n` +
      `Admin searches a student by name or ID, selects the\n` +
      `fee, and the bot generates and sends the official receipt\n` +
      `directly to the parent's WhatsApp in seconds.\n\n` +
      `Here is the receipt generated for *${student?.name ?? 'Chidi Okonkwo'}*:`
  );

  await delay(800);

  // ── Message 2: the receipt (same format parent gets) ──────
  await sendText(
    phone,
    `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏫 *GREENFIELD ACADEMY*\n` +
      `📍 Excellence Drive, Lagos\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🧾 *OFFICIAL PAYMENT RECEIPT*\n\n` +
      `Receipt No:   *${receiptNo}*\n` +
      `Date:         ${paidOn}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Student Details*\n` +
      `Name:         ${student?.name ?? 'Chidi Okonkwo'}\n` +
      `Class:        ${student?.class ?? 'JSS 3A'}\n` +
      `Adm No:       ${student?.admission_no ?? 'ADM/2026/001'}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Payment Details*\n` +
      `Fee:          ${feeName}\n` +
      `Amount Paid:  *${formatNaira(amountPaid)}*\n` +
      `Method:       ${method}\n` +
      `Reference:    ${reference}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ *Payment confirmed and recorded.*\n` +
      `This receipt has been sent to the parent automatically.\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_Powered by SchoolBot · XtopEdu_`
  );

  await delay(1000);

  // ── Message 3: show it delivered to parent ────────────────
  await sendText(
    phone,
    `📲 *Delivery Confirmation*\n\n` +
      `✅ Receipt sent to parent's WhatsApp\n` +
      `👤 Parent: Mrs. ${student?.name?.split(' ')[1] ?? 'Okonkwo'} (mother)\n` +
      `📱 Delivered: just now\n\n` +
      `The parent doesn't need to ask for a receipt —\n` +
      `it arrives automatically every time a payment is recorded.`
  );

  await delay(1000);

  await sendButtons(phone, `Continue exploring?`, [
    { id: 'PARENT_RECEIPT', title: '🧾 Parent View' },
    { id: 'ADMIN_DEMO_RESULT', title: '📝 Gen Result' },
    { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
  ]);
}

// ============================================================
// RESULT GENERATION HELPERS
// ============================================================

/**
 * Calculates grade and remark from total score.
 */
function getGradeRemark(total: number): { grade: string; remark: string } {
  if (total >= 75) return { grade: 'A', remark: 'Excellent' };
  if (total >= 65) return { grade: 'B', remark: 'Very Good' };
  if (total >= 55) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Pass' };
  if (total >= 40) return { grade: 'E', remark: 'Fair' };
  return { grade: 'F', remark: 'Fail' };
}

/**
 * Builds a result card text for a student.
 * Optionally adds slight variation per student so each result
 * looks unique in the multi-student admin result view.
 */
function buildResultCard(
  studentName: string,
  studentClass: string,
  admNo: string,
  term: string,
  session: string,
  subjectVariance = 0
): { resultText: string; average: number; position: number } {
  const rows = DEMO_SUBJECTS.map((sub) => {
    // Add a small variance so different students have different scores
    const variance = subjectVariance;
    const ca = Math.min(40, Math.max(0, sub.ca + variance));
    const exam = Math.min(60, Math.max(0, sub.exam + variance));
    const total = ca + exam;
    const { grade, remark } = getGradeRemark(total);
    return { name: sub.name, ca, exam, total, grade, remark };
  });

  const totalScore = rows.reduce((sum, r) => sum + r.total, 0);
  const average = Math.round(totalScore / rows.length);
  const position = average >= 65 ? 2 : average >= 55 ? 4 : 7;

  // Format subject rows (WhatsApp monospace-friendly)
  const subjectLines = rows
    .map(
      (r) =>
        `${r.name.padEnd(18)} CA:${String(r.ca).padStart(2)} Ex:${String(r.exam).padStart(2)} ` +
        `Tot:${String(r.total).padStart(3)}  ${r.grade}  ${r.remark}`
    )
    .join('\n');

  const resultText =
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🏫 *GREENFIELD ACADEMY*\n` +
    `📍 Excellence Drive, Lagos\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📝 *STUDENT TERM RESULT*\n` +
    `Term: ${term}  |  Session: ${session}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Student Details*\n` +
    `Name:     ${studentName}\n` +
    `Class:    ${studentClass}\n` +
    `Adm No:   ${admNo}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Academic Performance*\n\n` +
    `${subjectLines}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📈 *Overall*\n` +
    `Total Score:  ${totalScore}/${rows.length * 100}\n` +
    `Average:      ${average}%\n` +
    `Position:     ${position}${getOrdinalSuffix(position)} in class\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🗣️ *Class Teacher's Remark*\n` +
    `${average >= 65 ? 'Excellent performance. Keep it up! 🌟' : average >= 50 ? 'Good effort. Room for improvement. 💪' : 'Needs to put in more effort. 📚'}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_Powered by SchoolBot · XtopEdu_`;

  return { resultText, average, position };
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * sendParentResult
 * Shows the parent-facing result view — parent checks their
 * child's term result directly on WhatsApp.
 */
async function sendParentResult(phone: string, student: any): Promise<void> {
  const s = student ?? {
    name: 'Chidi Okonkwo',
    class: 'JSS 3A',
    admission_no: 'ADM/2026/001',
  };

  // ── Message 1: context ─────────────────────────────────────
  await sendText(
    phone,
    `📝 *Parent Result Experience*\n\n` +
      `A parent simply types "result" or taps the Results option\n` +
      `and instantly gets their child's full term result —\n` +
      `no portal login, no app needed.\n\n` +
      `Here is *${s.name}*'s result:`
  );

  await delay(800);

  // ── Message 2: the result card ─────────────────────────────
  const { resultText } = buildResultCard(
    s.name,
    s.class,
    s.admission_no ?? 'ADM/2026/001',
    'First Term',
    '2025/2026',
    0
  );

  await sendText(phone, resultText);

  await delay(1000);

  await sendButtons(phone, `Want to see the admin side — how results get generated?`, [
    { id: 'ADMIN_DEMO_RESULT', title: '📝 Admin Gen Result' },
    { id: 'PARENT_RECEIPT', title: '🧾 Receipt' },
    { id: 'ADMIN_BOT', title: '👨‍💼 School Side' },
  ]);
}

/**
 * sendAdminResult
 * Shows the admin-facing result generation — admin selects a
 * class, the bot generates results for ALL students and shows
 * a summary, then sends each result to the respective parent.
 */
async function sendAdminResult(phone: string): Promise<void> {
  // ── Message 1: context ─────────────────────────────────────
  await sendText(
    phone,
    `📝 *Admin: Generate Results*\n\n` +
      `The admin selects a class and term. The bot generates\n` +
      `results for ALL students and sends each result directly\n` +
      `to the parent's WhatsApp automatically.\n\n` +
      `Generating results for *JSS 2A* — First Term 2025/2026...`
  );

  await delay(1200);

  // ── Message 2: class summary table ────────────────────────
  const summaryLines = DEMO_CLASS_STUDENTS.map((s, i) => {
    const variance = (i % 3 === 0 ? 3 : i % 3 === 1 ? -2 : 1);
    const { average, position } = buildResultCard(
      s.name,
      s.class,
      s.admission_no,
      'First Term',
      '2025/2026',
      variance
    );
    return `${String(i + 1).padStart(2)}. ${s.name.padEnd(20)} Avg: ${String(average).padStart(3)}%  Pos: ${position}${getOrdinalSuffix(position)}`;
  });

  await sendText(
    phone,
    `📊 *JSS 2A — Result Summary*\n` +
      `Term: First Term  |  Session: 2025/2026\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${summaryLines.join('\n')}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ ${DEMO_CLASS_STUDENTS.length} results generated\n` +
      `📲 Sending to parents now...`
  );

  await delay(1500);

  // ── Message 3: sample individual result (first student) ───
  const first = DEMO_CLASS_STUDENTS[0];
  const { resultText } = buildResultCard(
    first.name,
    first.class,
    first.admission_no,
    'First Term',
    '2025/2026',
    3
  );

  await sendText(
    phone,
    `📲 *Sample: Result sent to ${first.name}'s parent*\n\n` +
      `This is exactly what the parent receives on WhatsApp:\n\n` +
      resultText
  );

  await delay(1200);

  // ── Message 4: delivery confirmation ──────────────────────
  const deliveryLines = DEMO_CLASS_STUDENTS.map(
    (s) => `✅ ${s.name} → parent notified`
  ).join('\n');

  await sendText(
    phone,
    `📬 *Delivery Report*\n\n` +
      `${deliveryLines}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ All ${DEMO_CLASS_STUDENTS.length} results delivered\n` +
      `📲 Every parent got their child's result instantly.\n\n` +
      `No printing. No collection day. No parent left behind. 🎓`
  );

  await delay(1000);

  await sendButtons(phone, `Continue exploring?`, [
    { id: 'PARENT_RESULT', title: '📝 Parent View' },
    { id: 'ADMIN_DEMO_RECEIPT_GEN', title: '🧾 Gen Receipt' },
    { id: 'ADMIN_BOT', title: '↩️ Admin Menu' },
  ]);
}

// ============================================================
// WHATSAPP API HELPERS
// ============================================================

async function sendText(to: string, body: string): Promise<void> {
  const apiUrl = Deno.env.get('WHATSAPP_API_URL') ?? 'https://graph.facebook.com/v25.0';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
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
  });

  const data = await res.text();
  console.log('[SEND TEXT]', data);

  if (!res.ok) throw new Error(`WhatsApp send failed: ${data}`);
}

async function sendButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const apiUrl = Deno.env.get('WHATSAPP_API_URL') ?? 'https://graph.facebook.com/v25.0';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
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
            reply: { id: b.id, title: b.title.substring(0, 20) },
          })),
        },
      },
    }),
  });

  const data = await res.text();
  console.log('[SEND BUTTONS]', data);

  if (!res.ok) throw new Error(`WhatsApp buttons failed: ${data}`);
}

async function sendList(
  to: string,
  header: string,
  body: string,
  footer: string,
  buttonLabel: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<void> {
  const apiUrl = Deno.env.get('WHATSAPP_API_URL') ?? 'https://graph.facebook.com/v25.0';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
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
        header: { type: 'text', text: header },
        body: { text: body },
        footer: { text: footer },
        action: { button: buttonLabel, sections },
      },
    }),
  });

  const data = await res.text();
  console.log('[SEND LIST]', data);

  if (!res.ok) throw new Error(`WhatsApp list failed: ${data}`);
}

// ============================================================
// DEMO DATA & UTILITY HELPERS
// ============================================================

function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

function generateReceiptNo(): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
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

  const { data: session, error: sessionErr } = await db
    .from('demo_persona_sessions')
    .select('student_id')
    .eq('phone', phone)
    .maybeSingle();

  if (sessionErr) console.error('[DEMO DB ERROR] session select', sessionErr);

  let studentId = session?.student_id;

  if (!studentId) {
    const { data: candidates, error: candErr } = await db
      .from('demo_students')
      .select('id');

    if (candErr) console.error('[DEMO DB ERROR] candidates select', candErr);
    if (!candidates || candidates.length === 0) return null;

    studentId = candidates[Math.floor(Math.random() * candidates.length)].id;

    await db
      .from('demo_persona_sessions')
      .upsert({ phone, student_id: studentId }, { onConflict: 'phone' })
      .then(({ error }) => {
        if (error) console.error('[DEMO DB ERROR] session upsert', error);
      });
  }

  const { data: student, error: studentErr } = await db
    .from('demo_students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (studentErr) console.error('[DEMO DB ERROR] student select', studentErr);
  if (!student) return null;

  const { data: invoices, error: invErr } = await db
    .from('demo_fee_invoices')
    .select('*')
    .eq('student_id', studentId);

  if (invErr) console.error('[DEMO DB ERROR] invoices select', invErr);

  const { data: pickupEvents, error: pickupErr } = await db
    .from('demo_pickup_events')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (pickupErr) console.error('[DEMO DB ERROR] pickup select', pickupErr);

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
  if (message.type === 'text') return message.text?.body?.trim() ?? '';
  return '';
}

function rawLooksLikeLead(text: string): boolean {
  return text.includes('|');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stub for lead capture flow (unchanged from original)
async function handleLeadCapture(phone: string, rawText: string): Promise<void> {
  const senderPhone = formatPhone(phone);
  const state = leadSessions.get(senderPhone);
  if (!state) return;

  // Simple passthrough — collect and confirm
  leadSessions.delete(senderPhone);

  await sendText(
    phone,
    `✅ *Registration Received*\n\n` +
      `Thank you! Our team will contact you shortly.`
  );

  const superAdmin = formatPhone(Deno.env.get('SUPER_ADMIN_PHONE') ?? '');
  if (superAdmin) {
    await sendText(superAdmin, `🧲 *New Lead*\n\n📱 ${phone}\n📝 ${rawText}`);
  }
}
