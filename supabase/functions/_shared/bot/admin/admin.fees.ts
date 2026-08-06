// ============================================================
// SCHOOLBOT - ADMIN FEES FLOW
// supabase/functions/_shared/bot/admin/admin.fees.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService } from '../../services/admin.service.ts';
import { FeesService } from '../../services/fees.service.ts';
import { showAdminMenu } from './admin.menu.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();
const feesSvc = new FeesService();

// ─── Start admin fees flow ─────────────────────────────────────────────────
export async function startAdminFees(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `💰 *Fee Management*\n\n` +
    `What would you like to do?`,
    [
      { id: 'FEES_SEARCH_STUDENT', title: '🔍 Find Student' },
      { id: 'FEES_COLLECTION_STATS', title: '📊 Collection Stats' },
      { id: 'FEES_OUTSTANDING_LIST', title: '⚠️ Outstanding List' },
    ],
    'Fee Management'
  );

  await sessions.setState(phone, 'ADMIN_FEES_MENU');
}

// ─── Handle fees menu ──────────────────────────────────────────────────────
export async function handleAdminFeesMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'fees_search_student':
      await promptStudentSearch(phone, session, wa);
      break;

    case 'fees_collection_stats':
      await showCollectionStats(phone, session, wa);
      break;

    case 'fees_outstanding_list':
      await showOutstandingList(phone, session, wa);
      break;

    default:
      await startAdminFees(phone, session, wa);
  }
}

// ─── Prompt admin to search student ───────────────────────────────────────
async function promptStudentSearch(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🔍 *Search Student*\n\n` +
    `Type the student's name or\n` +
    `admission number:\n\n` +
    `_Example: John or ADM/2024/001_\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(phone, 'ADMIN_STUDENTS_SEARCH');
}

// ─── Handle student search text input ─────────────────────────────────────
export async function handleStudentSearch(
  phone: string,
  session: BotSession,
  searchText: string,
  wa: WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text.length < 2) {
    await wa.text(
      phone,
      `⚠️ Please type at least *2 characters* to search.`
    );
    return;
  }

  // Search students
  const results = await adminSvc.searchStudents(
    session.school_id,
    text
  );

  if (!results.length) {
    await wa.buttons(
      phone,
      `❌ *No students found*\n\n` +
      `No students found for *"${text}"*\n\n` +
      `Try a different name or\n` +
      `admission number.`,
      [
        { id: 'FEES_SEARCH_STUDENT', title: '🔍 Search Again' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Single result - go directly to fees
  if (results.length === 1) {
    await showStudentFees(phone, session, results[0].id, wa);
    return;
  }

  // Multiple results - show list
  const rows = results.map((s) => ({
    id: `STUDENT_${s.id}`,
    title: s.full_name.substring(0, 24),
    description:
      `${s.class_name} ${s.arm_name} • ${s.admission_number}`,
  }));

  await wa.list(
    phone,
    `🔍 Search Results`,
    `Found *${results.length}* students\n` +
    `for *"${text}"*:\n\n` +
    `Tap a student to view their fees.`,
    `Select a student`,
    `👨‍🎓 Select Student`,
    [{ title: 'Students Found', rows }]
  );

  await sessions.setState(phone, 'ADMIN_FEES_SELECT_STUDENT');
}

// ─── Handle student selection from search results ──────────────────────────
export async function handleFeesStudentSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('student_')) {
    await startAdminFees(phone, session, wa);
    return;
  }

  const studentId = input.replace('student_', '');
  await showStudentFees(phone, session, studentId, wa);
}

// ─── Show student fees ─────────────────────────────────────────────────────
async function showStudentFees(
  phone: string,
  session: BotSession,
  studentId: string,
  wa: WhatsApp
): Promise<void> {
  // Get student details
  const db = (await import('../../supabase.ts')).getSupabase();
  const { data: student } = await db
    .from('students')
    .select(`
      first_name,
      last_name,
      admission_number,
      classes ( name ),
      class_arms ( name )
    `)
    .eq('id', studentId)
    .single();

  if (!student) {
    await wa.text(phone, `❌ Student not found.`);
    return;
  }

  const studentName = `${student.first_name} ${student.last_name}`;
  const className =
    (student.classes as Record<string, string> | null)?.name ?? '';
  const armName =
    (student.class_arms as Record<string, string> | null)?.name ?? '';

  // Get outstanding invoices
  const { invoices, total } = await adminSvc.getStudentOutstandingFees(
    studentId,
    session.school_id
  );

  if (!invoices.length) {
    await wa.buttons(
      phone,
      `💰 *Student Fees*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${studentName}*\n` +
      `🏫 ${className} ${armName}\n` +
      `📋 ${student.admission_number}\n\n` +
      `✅ *No outstanding fees!*\n` +
      `All fees are paid up.`,
      [
        { id: 'FEES_SEARCH_STUDENT', title: '🔍 Search Again' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Build invoice list
  const invoiceList = invoices
    .map((inv, i) =>
      `${i + 1}. *${inv.title as string}*\n` +
      `   💵 ${feesSvc.currency(inv.balance as number)}\n` +
      `   ${feesSvc.dueLabel(inv.due_date as string | null)}`
    )
    .join('\n\n');

  // Build rows for payment selection
  const payRows = [
    {
      id: `RECORD_PAY_ALL_${studentId}`,
      title: '💳 Record Full Payment',
      description: `Total: ${feesSvc.currency(total)}`,
    },
    ...invoices.map((inv) => ({
      id: `RECORD_PAY_${inv.id}_${studentId}`,
      title: (inv.title as string).substring(0, 24),
      description: feesSvc.currency(inv.balance as number),
    })),
  ];

  await wa.list(
    phone,
    `💰 Student Fees`,
    `👤 *${studentName}*\n` +
    `🏫 ${className} ${armName}\n\n` +
    `${invoiceList}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Total: ${feesSvc.currency(total)}*\n\n` +
    `Select an invoice to record payment:`,
    `Select invoice to pay`,
    `💳 Record Payment`,
    [{ title: 'Outstanding Invoices', rows: payRows }]
  );

  // Save to session
  await sessions.setState(
    phone,
    'ADMIN_FEES_SELECT_STUDENT',
    null,
    {
      data: {
        selectedStudentId: studentId,
        studentName,
        invoices,
        total,
      },
    }
  );
}

// ─── Handle payment method selection ──────────────────────────────────────
export async function handleRecordPayment(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('record_pay_')) {
    await startAdminFees(phone, session, wa);
    return;
  }

  const isAll = input.startsWith('record_pay_all_');
  let invoiceId: string | null = null;
  let studentId: string;

  if (isAll) {
    studentId = input.replace('record_pay_all_', '');
  } else {
    // Format: record_pay_{invoiceId}_{studentId}
    const parts = input.replace('record_pay_', '').split('_');
    invoiceId = parts[0];
    studentId = parts.slice(1).join('_');
  }

  const storedInvoices = (
    session.data?.invoices ?? []
  ) as Record<string, unknown>[];
  const storedTotal = (session.data?.total ?? 0) as number;
  const studentName =
    (session.data?.studentName as string) ?? 'Student';

  // Determine which invoice and amount
  let targetInvoiceId: string;
  let targetAmount: number;
  let targetTitle: string;

  if (isAll) {
    targetInvoiceId = storedInvoices[0]?.id as string;
    targetAmount = storedTotal;
    targetTitle = 'All Outstanding Fees';
  } else {
    const invoice = storedInvoices.find(
      (inv) => inv.id === invoiceId
    );
    if (!invoice) {
      await wa.text(phone, `❌ Invoice not found. Please try again.`);
      return;
    }
    targetInvoiceId = invoice.id as string;
    targetAmount = invoice.balance as number;
    targetTitle = invoice.title as string;
  }

  // Show payment method selection
  await wa.list(
    phone,
    `💳 Payment Method`,
    `Recording payment for:\n` +
    `*${targetTitle}*\n\n` +
    `👤 *${studentName}*\n` +
    `💵 Amount: *${feesSvc.currency(targetAmount)}*\n\n` +
    `How was this payment made?`,
    `Select payment method`,
    `💳 Select Method`,
    [
      {
        title: 'Payment Methods',
        rows: [
          {
            id: `PAYMETHOD_CASH_${targetInvoiceId}_${studentId}`,
            title: '💵 Cash',
            description: 'Physical cash payment',
          },
          {
            id: `PAYMETHOD_TRANSFER_${targetInvoiceId}_${studentId}`,
            title: '🏦 Bank Transfer',
            description: 'Direct bank transfer',
          },
          {
            id: `PAYMETHOD_POS_${targetInvoiceId}_${studentId}`,
            title: '💳 POS / Card',
            description: 'Card payment via POS',
          },
          {
            id: `PAYMETHOD_CHEQUE_${targetInvoiceId}_${studentId}`,
            title: '📄 Cheque',
            description: 'Cheque payment',
          },
        ],
      },
    ]
  );

  // Save to session
  await sessions.setState(
    phone,
    'ADMIN_FEES_RECORD_PAYMENT',
    null,
    {
      data: {
        ...session.data,
        targetInvoiceId,
        targetStudentId: studentId,
        targetAmount,
        targetTitle,
      },
    }
  );
}

// ─── Handle payment method chosen ─────────────────────────────────────────
export async function handlePayMethod(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('paymethod_')) {
    await startAdminFees(phone, session, wa);
    return;
  }

  // Format: paymethod_{method}_{invoiceId}_{studentId}
  const parts = input.replace('paymethod_', '').split('_');
  const method = parts[0];
  const invoiceId = parts[1];
  const studentId = parts.slice(2).join('_');

  const methodLabels: Record<string, string> = {
    cash:     '💵 Cash',
    transfer: '🏦 Bank Transfer',
    pos:      '💳 POS/Card',
    cheque:   '📄 Cheque',
  };

  const amount =
    (session.data?.targetAmount as number) ?? 0;
  const title =
    (session.data?.targetTitle as string) ?? 'Fee Payment';
  const studentName =
    (session.data?.studentName as string) ?? 'Student';

  // Show confirmation before recording
  await wa.buttons(
    phone,
    `💳 *Confirm Payment*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${studentName}*\n` +
    `📋 *Fee:* ${title}\n` +
    `💵 *Amount:* ${feesSvc.currency(amount)}\n` +
    `💳 *Method:* ${methodLabels[method] ?? method}\n` +
    `📅 *Date:* ${new Date().toLocaleDateString('en-NG')}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Confirm this payment?`,
    [
      {
        id: `CONFIRM_PAY_${method}_${invoiceId}_${studentId}`,
        title: '✅ Confirm',
      },
      { id: 'ADMIN_FEES', title: '❌ Cancel' },
    ]
  );

  // Save method to session
  await sessions.setState(
    phone,
    'ADMIN_FEES_AWAITING_CONFIRM',
    null,
    {
      data: {
        ...session.data,
        paymentMethod: method,
        targetInvoiceId: invoiceId,
        targetStudentId: studentId,
      },
    }
  );
}

// ─── Confirm and record payment ────────────────────────────────────────────
export async function confirmPayment(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('confirm_pay_')) {
    await startAdminFees(phone, session, wa);
    return;
  }

  // Format: confirm_pay_{method}_{invoiceId}_{studentId}
  const parts = input.replace('confirm_pay_', '').split('_');
  const method = parts[0];
  const invoiceId = parts[1];
  const studentId = parts.slice(2).join('_');

  const amount =
    (session.data?.targetAmount as number) ?? 0;
  const title =
    (session.data?.targetTitle as string) ?? 'Fee Payment';
  const studentName =
    (session.data?.studentName as string) ?? 'Student';

  try {
    // Generate reference
    const reference = `MANUAL-${Date.now().toString(36).toUpperCase()}`;

    // Record payment in DB
    await adminSvc.recordManualPayment({
      schoolId: session.school_id,
      studentId,
      invoiceId,
      amount,
      method,
      reference,
      recordedBy: session.school_user_id ?? session.school_id,
    });

    // Log admin action
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'record_manual_payment',
      {
        student_id: studentId,
        invoice_id: invoiceId,
        amount,
        method,
        reference,
      }
    );

    // Send success message
    await wa.buttons(
      phone,
      `✅ *Payment Recorded!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${studentName}*\n` +
      `📋 ${title}\n` +
      `💵 *Amount:* ${feesSvc.currency(amount)}\n` +
      `💳 *Method:* ${method}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG')}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Parent has been notified via WhatsApp. 📱`,
      [
        { id: 'FEES_SEARCH_STUDENT', title: '🔍 New Search' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );

    // Notify parent
    await adminSvc.notifyParentOfPayment(
      studentId,
      session.school_id,
      amount,
      method,
      reference,
      title
    );
  } catch (err) {
    console.error('[AdminFees] confirmPayment error:', err);
    await wa.text(
      phone,
      `❌ *Payment failed to record*\n\n` +
      `Please try again.\n\n` +
      `Error: ${err}`
    );
  }
}

// ─── Show fee collection stats ─────────────────────────────────────────────
async function showCollectionStats(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const stats = await adminSvc.getFeeStats(session.school_id);

  const rateIcon =
    stats.collectionRate >= 80
      ? '🟢'
      : stats.collectionRate >= 60
      ? '🟡'
      : '🔴';

  await wa.buttons(
    phone,
    `📊 *Fee Collection Report*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `💵 *Total Billed:*\n` +
    `   ${adminSvc.currency(stats.totalBilled)}\n\n` +
    `✅ *Total Collected:*\n` +
    `   ${adminSvc.currency(stats.totalCollected)}\n\n` +
    `⚠️ *Outstanding:*\n` +
    `   ${adminSvc.currency(stats.totalOutstanding)}\n\n` +
    `${rateIcon} *Collection Rate: ${stats.collectionRate}%*\n\n` +
    `📋 Total Invoices: *${stats.total}*\n` +
    `✅ Paid:           *${stats.paidCount}*\n` +
    `⏳ Pending:        *${stats.pendingCount}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'FEES_OUTSTANDING_LIST', title: '⚠️ Outstanding' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Show list of students with outstanding fees ───────────────────────────
async function showOutstandingList(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const list = await adminSvc.getStudentsWithOutstandingFees(
    session.school_id,
    8
  );

  if (!list.length) {
    await wa.buttons(
      phone,
      `🎉 *No Outstanding Fees!*\n\n` +
      `All students are up to date\n` +
      `with their fee payments.`,
      [{ id: 'MAIN_MENU', title: '🏠 Menu' }]
    );
    return;
  }

  const lines = (list as Record<string, unknown>[])
    .map((item, i) => {
      const s = item.students as Record<string, unknown> | null;
      const fs = item.fee_structures as Record<
        string,
        string
      > | null;
      const cls =
        (s?.classes as Record<string, string> | null)?.name ?? '';
      const arm =
        (s?.class_arms as Record<string, string> | null)?.name ?? '';
      const balance = feesSvc.currency(
        parseFloat(String(item.balance ?? 0))
      );

      return (
        `${i + 1}. *${s?.first_name} ${s?.last_name}*\n` +
        `   🏫 ${cls} ${arm}\n` +
        `   💵 ${balance} outstanding`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `⚠️ *Students with Outstanding Fees*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_Showing top 8 by amount_`,
    [
      { id: 'FEES_SEARCH_STUDENT', title: '🔍 Find Student' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}
