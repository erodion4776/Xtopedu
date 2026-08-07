// ============================================================
// SCHOOLBOT - ADMIN RECEIPTS FLOW
// supabase/functions/_shared/bot/admin/admin.receipts.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { ReceiptService } from '../../receipt.service.ts';
import { getSupabase } from '../../supabase.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const receiptSvc = new ReceiptService();
const db = getSupabase();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

// ─── Start receipt management ──────────────────────────────────
export async function startReceiptMgmt(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    '🧾 Fee Receipts',
    'Manage and send payment receipts\nto parents via WhatsApp.\n\nWhat would you like to do?',
    'Receipts sent directly to parents',
    '🧾 Receipt Options',
    [
      {
        title: 'Receipt Options',
        rows: [
          {
            id: 'receipt_search',
            title: '🔍 Search Receipt',
            description: 'Find by student name or ref',
          },
          {
            id: 'receipt_recent',
            title: '📋 Recent Payments',
            description: 'Last 10 fee payments',
          },
          {
            id: 'receipt_unsent',
            title: '📤 Unsent Receipts',
            description: 'Receipts not sent to parents',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_RECEIPT_MENU');
}

// ─── Handle receipt menu ───────────────────────────────────────
export async function handleReceiptMenu(
  phone: string,
  session: BotSession,
  input: string,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'receipt_search':
      await promptReceiptSearch(phone, session, wa);
      break;
    case 'receipt_recent':
      await showRecentReceipts(phone, session, wa);
      break;
    case 'receipt_unsent':
      await showUnsentReceipts(phone, session, wa);
      break;
    default:
      await startReceiptMgmt(phone, session, wa);
  }
}

// ─── Prompt to search receipt ──────────────────────────────────
async function promptReceiptSearch(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    '🔍 *Search Receipt*\n\n' +
    'Enter student name or payment\nreference number:\n\n' +
    '_Examples:_\n• John Doe\n• SCH-A1B2C3-D4E5\n\n' +
    'Type *0* to go back.'
  );
  await sessions.setState(phone, 'ADMIN_RECEIPT_SEARCH');
}

// ─── Handle receipt search ─────────────────────────────────────
export async function handleReceiptSearch(
  phone: string,
  session: BotSession,
  searchText: string,
  wa: WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text.length < 2) {
    await wa.text(phone, 'Please type at least 2 characters.');
    return;
  }

  let payments = await receiptSvc.searchReceipts(
    session.school_id,
    text
  );

  if (!payments.length) {
    payments = await receiptSvc.searchPaymentsByStudent(
      session.school_id,
      text
    );
  }

  if (!payments.length) {
    await wa.buttons(
      phone,
      '❌ *No payments found*\n\n' +
      `No results for *"${text}"*\n\n` +
      'Try searching by:\n• Student name\n• Payment reference',
      [
        { id: 'receipt_search', title: '🔍 Search Again' },
        { id: 'receipt_recent', title: '📋 Recent' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  await showPaymentListForReceipt(phone, payments, wa);
}

// ─── Show recent receipts ──────────────────────────────────────
async function showRecentReceipts(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const payments = await receiptSvc.getRecentReceipts(
    session.school_id,
    10
  );

  if (!payments.length) {
    await wa.buttons(
      phone,
      '📋 *Recent Payments*\n\nNo payments found yet.',
      [{ id: 'MAIN_MENU', title: '🏠 Menu' }]
    );
    return;
  }

  await showPaymentListForReceipt(phone, payments, wa);
}

// ─── Show unsent receipts ──────────────────────────────────────
async function showUnsentReceipts(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const unsent = await receiptSvc.getUnsentReceipts(
    session.school_id
  );

  if (!unsent.length) {
    await wa.buttons(
      phone,
      '✅ *All Receipts Sent!*\n\n' +
      'All recent payments have been\nsent to parents already.',
      [
        { id: 'receipt_recent', title: '📋 All Receipts' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  const payments = unsent.map((r) => {
    const student = r.students as Record<string, string> | null;
    return {
      id: r.payment_id ?? r.id,
      amount: r.amount_paid,
      payment_method: r.payment_method,
      paid_at: r.payment_date,
      gateway_reference: `Receipt: ${r.receipt_number}`,
      students: {
        first_name: student?.first_name ?? '',
        last_name: student?.last_name ?? '',
        admission_number: '',
      },
    };
  });

  await showPaymentListForReceipt(
    phone,
    payments as Record<string, unknown>[],
    wa
  );
}

// ─── Show payment list for receipt selection ───────────────────
async function showPaymentListForReceipt(
  phone: string,
  payments: Record<string, unknown>[],
  wa: WhatsApp
): Promise<void> {
  const rows = payments.slice(0, 10).map((p) => {
    const student = p.students as Record<string, string> | null;
    const amount = parseFloat(String(p.amount ?? 0));
    const date = p.paid_at
      ? new Date(String(p.paid_at)).toLocaleDateString('en-NG', {
          day: 'numeric',
          month: 'short',
        })
      : 'N/A';

    const name =
      student
        ? `${student.first_name} ${student.last_name}`
        : 'Unknown';

    return {
      id: `GEN_RECEIPT_${p.id}`,
      title: name.substring(0, 24),
      description: `${fmt(amount)} • ${date}`,
    };
  });

  await wa.list(
    phone,
    '🧾 Select Payment',
    'Select a payment to view\nor send receipt to parent:',
    'Receipt sent via WhatsApp',
    '🧾 Select',
    [{ title: 'Payments', rows }]
  );

  await sessions.setState(phone, 'ADMIN_RECEIPT_VIEW');
}

// ─── Handle receipt generation ─────────────────────────────────
export async function handleGenerateReceipt(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('gen_receipt_')) return;

  const paymentId = input.replace('gen_receipt_', '');

  await wa.text(phone, '⏳ Generating receipt...');

  try {
    const receipt = await receiptSvc.generateReceipt(paymentId);

    const { data: payment } = await db
      .from('payments')
      .select(`
        student_id,
        student_parents:student_parents (
          parents ( full_name, phone, whatsapp_number )
        )
      `)
      .eq('id', paymentId)
      .single();

    const sps = payment?.student_parents as
      | Record<string, unknown>[]
      | null;

    const parent = sps?.[0]?.parents as
      | Record<string, string>
      | null;

    const parentPhone = parent?.whatsapp_number ?? parent?.phone;
    const parentName = parent?.full_name ?? 'Parent';

    await wa.text(phone, receipt.receiptText);

    await new Promise((r) => setTimeout(r, 1000));

    if (parentPhone) {
      await wa.buttons(
        phone,
        `🧾 *Receipt #${receipt.receiptNumber}*\n\n` +
        `Send to parent:\n👤 *${parentName}*\n📱 ${parentPhone}`,
        [
          {
            id: `SEND_RECEIPT_${receipt.receiptId}_${parentPhone}`,
            title: '📤 Send to Parent',
          },
          { id: 'receipt_recent', title: '📋 More Receipts' },
          { id: 'MAIN_MENU', title: '🏠 Menu' },
        ]
      );
    } else {
      await wa.buttons(
        phone,
        `🧾 *Receipt #${receipt.receiptNumber}*\n\n` +
        '⚠️ No parent phone number\nfound for this student.',
        [
          { id: 'receipt_recent', title: '📋 More Receipts' },
          { id: 'MAIN_MENU', title: '🏠 Menu' },
        ]
      );
    }
  } catch (err) {
    console.error('[Receipts] generateReceipt error:', err);
    await wa.text(
      phone,
      '❌ *Failed to generate receipt*\n\nPlease try again.'
    );
  }
}

// ─── Handle send receipt ───────────────────────────────────────
export async function handleSendReceipt(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('send_receipt_')) return;

  const withoutPrefix = input.replace('send_receipt_', '');
  const underscoreIndex = withoutPrefix.indexOf('_');
  const receiptId = withoutPrefix.substring(0, underscoreIndex);
  const parentPhone = withoutPrefix.substring(underscoreIndex + 1);

  if (!receiptId || !parentPhone) {
    await wa.text(phone, '❌ Invalid receipt data. Try again.');
    return;
  }

  await wa.text(phone, '⏳ Sending receipt to parent...');

  try {
    const { data: waAccount } = await db
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, status')
      .eq('school_id', session.school_id)
      .eq('status', 'active')
      .single();

    await receiptSvc.sendReceiptToParent(
      receiptId,
      parentPhone,
      waAccount as Record<string, unknown> | null
    );

    await wa.buttons(
      phone,
      '✅ *Receipt Sent!*\n\n' +
      'Receipt has been sent to the\n' +
      "parent's WhatsApp successfully. 📱",
      [
        { id: 'receipt_recent', title: '📋 More Receipts' },
        { id: 'receipt_unsent', title: '📤 Unsent' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
  } catch (err) {
    console.error('[Receipts] sendReceipt error:', err);
    await wa.text(
      phone,
      '❌ *Failed to send receipt*\n\nPlease try again.'
    );
  }
}
