// ============================================================
// SCHOOLBOT - PARENT FEES FLOW
// supabase/functions/_shared/bot/fees.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { FeesService } from '../services/fees.service.ts';
import { showMainMenu } from './menu.ts';
import type { BotSession, Student, Invoice } from '../types.ts';

const sessions = new SessionService();
const feesSvc = new FeesService();

// ─── Start fees flow ───────────────────────────────────────────────────────
// Called when parent selects Fees from main menu
export async function startFees(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const students = session.students ?? [];

  // No students linked
  if (!students.length) {
    await wa.text(
      phone,
      `❌ *No students found*\n\n` +
      `No students are linked to your account.\n\n` +
      `Contact your school admin to link\n` +
      `your children to this number.`
    );
    return;
  }

  // Only one child - go straight to fees menu
  if (students.length === 1) {
    await showFeesMenu(phone, session, students[0], wa);
    return;
  }

  // Multiple children - show selector
  await wa.list(
    phone,
    `💰 School Fees`,
    `You have *${students.length}* children registered.\n\n` +
    `Select a child to view fees:`,
    `Tap a name to continue`,
    `👦 Choose Child`,
    [
      {
        title: 'Your Children',
        rows: students.map((s) => ({
          id: `FEES_STUDENT_${s.id}`,
          title: s.first_name,
          description:
            `${s.class_name} ${s.arm_name}`.trim() ||
            s.admission_number,
        })),
      },
    ]
  );

  await sessions.setState(phone, 'FEES_SELECT_STUDENT');
}

// ─── Handle student selection ──────────────────────────────────────────────
export async function handleStudentSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('fees_student_')) {
    await startFees(phone, session, wa);
    return;
  }

  const studentId = input.replace('fees_student_', '');
  const student = session.students?.find((s) => s.id === studentId);

  if (!student) {
    await showMainMenu(phone, session, wa);
    return;
  }

  await showFeesMenu(phone, session, student, wa);
}

// ─── Show fees menu ────────────────────────────────────────────────────────
async function showFeesMenu(
  phone: string,
  session: BotSession,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `💰 *School Fees*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `📋 Adm: ${student.admission_number}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `What would you like to do?`,
    [
      { id: 'FEES_OUTSTANDING', title: '📋 Outstanding' },
      { id: 'FEES_HISTORY', title: '🧾 History' },
      { id: 'FEES_PAY', title: '💳 Pay Now' },
    ],
    'Fee Options'
  );

  // Save selected student
  await sessions.setState(
    phone,
    'FEES_OPTIONS',
    null,
    { selectedStudentId: student.id }
  );
}

// ─── Handle fees option selection ─────────────────────────────────────────
export async function handleFeesOption(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Get selected student
  const student = session.students?.find(
    (s) => s.id === session.selected_student_id
  );

  if (!student) {
    await startFees(phone, session, wa);
    return;
  }

  switch (input) {
    case 'fees_outstanding':
      await showOutstandingFees(phone, student, wa);
      break;

    case 'fees_history':
      await showPaymentHistory(phone, student, wa);
      break;

    case 'fees_pay':
      await startPaymentFlow(phone, student, session, wa);
      break;

    case 'main_menu':
      await showMainMenu(phone, session, wa);
      break;

    default:
      await showFeesMenu(phone, session, student, wa);
  }
}

// ─── Show outstanding fees ─────────────────────────────────────────────────
async function showOutstandingFees(
  phone: string,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  const { invoices, total } = await feesSvc.getOutstanding(
    student.id,
    student.school_id
  );

  // No outstanding fees
  if (!invoices.length) {
    await wa.buttons(
      phone,
      `🎉 *No Outstanding Fees!*\n\n` +
      `✅ *${student.full_name}* has no\n` +
      `pending fees.\n\n` +
      `All fees are paid up! 👏`,
      [
        { id: 'FEES_HISTORY', title: '🧾 Payment History' },
        { id: 'MAIN_MENU', title: '🏠 Main Menu' },
      ]
    );
    return;
  }

  // Build fee list
  const feesList = invoices
    .map((inv, index) =>
      `${index + 1}. *${inv.title}*\n` +
      `   💵 ${feesSvc.currency(inv.balance)}\n` +
      `   ${feesSvc.dueLabel(inv.due_date)}`
    )
    .join('\n\n');

  await wa.buttons(
    phone,
    `💰 *Outstanding Fees*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n\n` +
    `${feesList}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Total: ${feesSvc.currency(total)}*`,
    [
      { id: 'FEES_PAY', title: '💳 Pay Now' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}

// ─── Show payment history ──────────────────────────────────────────────────
async function showPaymentHistory(
  phone: string,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  const history = await feesSvc.getHistory(student.id, 5);

  if (!history.length) {
    await wa.buttons(
      phone,
      `🧾 *Payment History*\n\n` +
      `👤 *${student.full_name}*\n\n` +
      `📭 No payment records found yet.`,
      [
        { id: 'FEES_PAY', title: '💳 Make Payment' },
        { id: 'MAIN_MENU', title: '🏠 Main Menu' },
      ]
    );
    return;
  }

  // Build payment list
  const paymentLines = history
    .map((p) => {
      const date = new Date(
        String(p.paid_date ?? p.created_at)
      ).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      return (
        `✅ *${feesSvc.currency(p.amount as number)}*\n` +
        `   📅 ${date}\n` +
        `   💳 ${p.payment_method ?? 'Online'}\n` +
        `   🔖 ${p.invoice_title}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `🧾 *Payment History*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n\n` +
    `${paymentLines}`,
    [
      { id: 'FEES_OUTSTANDING', title: '📋 Outstanding' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}

// ─── Start payment flow ────────────────────────────────────────────────────
async function startPaymentFlow(
  phone: string,
  student: Student,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const { invoices, total } = await feesSvc.getOutstanding(
    student.id,
    student.school_id
  );

  // Nothing to pay
  if (!invoices.length) {
    await wa.text(
      phone,
      `🎉 *${student.first_name}* has no\n` +
      `outstanding fees! All paid up! ✅`
    );
    return;
  }

  // Single invoice - show breakdown and confirm
  if (invoices.length === 1) {
    await showPaymentBreakdown(
      phone,
      invoices[0],
      student,
      session,
      wa
    );
    return;
  }

  // Multiple invoices - let parent choose which to pay
  const rows = invoices.map((inv) => ({
    id: `PAY_INVOICE_${inv.id}`,
    title: inv.title.substring(0, 24),
    description: feesSvc.currency(inv.balance),
  }));

  // Add pay all option at the top
  rows.unshift({
    id: `PAY_ALL`,
    title: '💳 Pay All Fees',
    description: `Total: ${feesSvc.currency(total)}`,
  });

  await wa.list(
    phone,
    `💳 Choose Fee to Pay`,
    `Select which fee to pay for\n*${student.first_name}*:`,
    `Total outstanding: ${feesSvc.currency(total)}`,
    `💳 Select`,
    [
      {
        title: 'Outstanding Fees',
        rows,
      },
    ]
  );

  // Save invoices to session data
  await sessions.setState(
    phone,
    'FEES_SELECT_INVOICE',
    null,
    {
      selectedStudentId: student.id,
      data: { invoices, total },
    }
  );
}

// ─── Handle invoice selection ──────────────────────────────────────────────
export async function handleInvoiceSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  const student = session.students?.find(
    (s) => s.id === session.selected_student_id
  );

  if (!student) {
    await showMainMenu(phone, session, wa);
    return;
  }

  const storedInvoices = (
    session.data?.invoices ?? []
  ) as Invoice[];
  const storedTotal = (session.data?.total ?? 0) as number;

  // Pay all outstanding
  if (input === 'pay_all') {
    if (!storedInvoices.length) {
      await startFees(phone, session, wa);
      return;
    }

    // Create a combined invoice representing total
    const combinedInvoice: Invoice = {
      ...storedInvoices[0],
      title: 'All Outstanding Fees',
      balance: storedTotal,
      amount: storedTotal,
    };

    await showPaymentBreakdown(
      phone,
      combinedInvoice,
      student,
      session,
      wa
    );
    return;
  }

  // Pay specific invoice
  if (input.startsWith('pay_invoice_')) {
    const invoiceId = input.replace('pay_invoice_', '');
    const invoice = storedInvoices.find((inv) => inv.id === invoiceId);

    if (invoice) {
      await showPaymentBreakdown(
        phone,
        invoice,
        student,
        session,
        wa
      );
    } else {
      await startFees(phone, session, wa);
    }
    return;
  }

  await startFees(phone, session, wa);
}

// ─── Show payment charges breakdown ───────────────────────────────────────
// Shows parent exactly what they will pay before generating link
async function showPaymentBreakdown(
  phone: string,
  invoice: Invoice,
  student: Student,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const charges = feesSvc.getCharges(invoice.balance);

  await wa.buttons(
    phone,
    `💰 *Payment Summary*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `📋 *${invoice.title}*\n\n` +
    `💵 School Fee:     *${feesSvc.currency(charges.schoolAmount)}*\n` +
    `🏷️ Platform Fee:   *${feesSvc.currency(charges.platformCommission)}* (1.5%)\n` +
    `🏦 Processing Fee: *${feesSvc.currency(charges.paystackCharge)}*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💳 *Total: ${feesSvc.currency(charges.totalParentPays)}*\n\n` +
    `🏫 School receives full\n` +
    `*${feesSvc.currency(charges.schoolAmount)}*`,
    [
      {
        id: `CONFIRM_PAY_${invoice.id}`,
        title: '✅ Proceed to Pay',
      },
      { id: 'FEES_OUTSTANDING', title: '❌ Cancel' },
    ],
    'Payment Breakdown'
  );

  // Save pending invoice to session
  await sessions.setState(
    phone,
    'FEES_CONFIRM_PAY',
    null,
    {
      data: { pendingInvoice: invoice },
    }
  );
}

// ─── Handle payment confirmation ───────────────────────────────────────────
export async function handleConfirmPay(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Must start with confirm_pay_
  if (!input.startsWith('confirm_pay_')) return;

  const invoiceId = input.replace('confirm_pay_', '');
  const pendingInvoice = session.data?.pendingInvoice as
    | Invoice
    | null;

  const student = session.students?.find(
    (s) => s.id === session.selected_student_id
  );

  if (!student) {
    await showMainMenu(phone, session, wa);
    return;
  }

  // Use stored invoice or fetch fresh
  const invoice = pendingInvoice ?? {
    id: invoiceId,
    balance: 0,
    title: 'School Fee',
  } as Invoice;

  await wa.text(
    phone,
    `⏳ Generating secure payment link...\n\n` +
    `Please wait a moment.`
  );

  const parent = session.parent!;

  // Start payment
  const result = await feesSvc.startPayment({
    invoiceId: invoice.id,
    studentId: student.id,
    schoolId: student.school_id,
    email: parent.email ?? '',
    phone: parent.whatsapp_number ?? parent.phone,
    schoolFeeAmount: invoice.balance,
  });

  if (!result) {
    await wa.buttons(
      phone,
      `❌ *Payment link failed*\n\n` +
      `Could not generate payment link.\n\n` +
      `Please try again or contact\n` +
      `your school admin.`,
      [
        { id: 'FEES_PAY', title: '🔄 Try Again' },
        { id: 'MAIN_MENU', title: '🏠 Main Menu' },
      ]
    );
    return;
  }

  const { charges } = result;

  // Send payment link
  await wa.text(
    phone,
    `💳 *Payment Link Ready!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `📋 *${invoice.title}*\n\n` +
    `💵 School Fee:     *${feesSvc.currency(charges.schoolAmount)}*\n` +
    `🏷️ Platform Fee:   *${feesSvc.currency(charges.platformCommission)}*\n` +
    `🏦 Processing Fee: *${feesSvc.currency(charges.paystackCharge)}*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💳 *Pay: ${feesSvc.currency(charges.totalParentPays)}*\n\n` +
    `👇 *Tap to pay securely:*\n` +
    `${result.payUrl}\n\n` +
    `⏰ Link valid for *30 minutes*\n` +
    `🔖 Ref: ${result.reference}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ You will receive a confirmation\n` +
    `here after payment.\n\n` +
    `_Type *menu* to return to main menu_`
  );

  // Update session to payment pending state
  await sessions.setState(
    phone,
    'PAYMENT_PENDING',
    null,
    {
      data: { paymentRef: result.reference },
    }
  );
}

// ─── Handle payment pending state ─────────────────────────────────────────
// When parent types anything while payment is pending
export async function handlePaymentPending(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `⏳ *Payment Still Pending*\n\n` +
    `Your payment link is still active.\n\n` +
    `Complete payment by tapping the link\n` +
    `sent to you above.\n\n` +
    `After payment you will receive\n` +
    `a confirmation here automatically.\n\n` +
    `_Type *menu* to return to main menu_`
  );
}
