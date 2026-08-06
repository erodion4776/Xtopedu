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

// ─── Currency formatter ────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

// ─── Start receipt management ──────────────────────────────────────────────
export async function startReceiptMgmt(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `🧾 Fee Receipts`,
    `Manage and send payment receipts\n` +
    `to parents via WhatsApp.\n\n` +
    `What would you like to do?`,
    `Receipts sent directly to parents`,
    `🧾 Receipt Options`,
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

// ─── Handle receipt menu ───────────────────────────────────────────────────
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

// ─── Prompt to search receipt ──────────────────────────────────────────────
async function promptReceiptSearch(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🔍 *Search Receipt*\n\n` +
    `Enter student name or payment\n` +
    `reference number:\n\n` +
    `_Examples:_\n` +
    `• John Doe\n` +
    `• SCH-A1B2C3-D4E5\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(phone, 'ADMIN_RECEIPT_SEARCH');
}

// ─── Handle receipt search input ──────────────────────────────────────────
export async function handleReceiptSearch(
  phone: string,
  session: BotSession,
  searchText: string,
  wa: WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text.length < 2) {
    await wa.text(
      phone,
      `Please type at least 2 characters.`
    );
    return;
  }

  // Try searching by reference first
  let payments = await receiptSvc.searchReceipts(
    session.school_id,
    text
  );

  // If no results by reference, search by student name
  if (!payments.length) {
    payments = await receiptSvc.searchPaymentsByStudent(
      session.school_id,
      text
    );
  }

  if (!payments.length) {
    await wa.buttons(
      phone,
      `❌ *No payments found*\n\n` +
      `No results for *"${text}"*\n\n` +
      `Try searching by:\n` +
      `• Student name\n` +
      `• Payment reference`,
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

// ─── Show recent payments ──────────────────────────────────────────────────
async function showRecentReceipts(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const payments = await receiptSvc.getRecentReceipts(
    session.school_id,
    10
  );

  if (!payments.length) 
