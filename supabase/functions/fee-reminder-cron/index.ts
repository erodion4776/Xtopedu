// ============================================================
// SCHOOLBOT - FEE REMINDER CRON
// supabase/functions/fee-reminder-cron/index.ts
// ============================================================

import { WhatsApp } from '../_shared/whatsapp.ts';
import { FeesService } from '../_shared/services/fees.service.ts';
import { getSupabase } from '../_shared/supabase.ts';

const db = getSupabase();
const feesSvc = new FeesService();

Deno.serve(async (req: Request): Promise<Response> => {
  // Verify cron secret
  const secret = req.headers.get('x-cron-secret');
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'due_soon';

  console.log(`[Cron] Running: ${type}`);

  try {
    if (type === 'due_soon') await sendDueSoon();
    if (type === 'overdue') await sendOverdue();
    if (type === 'cleanup') await cleanup();

    return new Response(
      JSON.stringify({ ok: true, type }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(`[Cron] Error:`, err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});

async function sendDueSoon(): Promise<void> {
  const invoices = await feesSvc.getInvoicesDueSoon(3);
  console.log(`[Cron] ${invoices.length} invoices due soon`);
  for (const inv of invoices as Record<string, unknown>[]) {
    await processReminder(inv, 'due_soon');
    await delay(300);
  }
}

async function sendOverdue(): Promise<void> {
  const invoices = await feesSvc.getOverdueInvoices();
  console.log(`[Cron] ${invoices.length} overdue invoices`);
  for (const inv of invoices as Record<string, unknown>[]) {
    await processReminder(inv, 'overdue');
    await delay(300);
  }
}

async function processReminder(
  invoice: Record<string, unknown>,
  type: string
): Promise<void> {
  const student = invoice.students as Record<string, unknown> | null;
  if (!student) return;

  const sps = student.student_parents as Record<string, unknown>[] | null;
  if (!sps?.length) return;

  for (const sp of sps) {
    if (!sp.can_receive_fee_notifications) continue;

    const parent = sp.parents as Record<string, string> | null;
    if (!parent) continue;

    const phone = parent.whatsapp_number ?? parent.phone;
    if (!phone) continue;

    // Check if already sent today
    const sent = await feesSvc.reminderSentToday(
      invoice.id as string,
      parent.id,
      type
    );
    if (sent) continue;

    const { data: waAccount } = await db
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token, status')
      .eq('school_id', invoice.school_id as string)
      .eq('status', 'active')
      .single();

    const wa = new WhatsApp(waAccount);
    const feeTitle = (invoice.fee_structures as Record<string, string> | null)?.title ?? 'School Fee';
    const balance = feesSvc.currency(parseFloat(String(invoice.balance ?? 0)));
    const firstName = parent.full_name?.split(' ')[0] ?? 'Parent';
    const studentName = `${student.first_name} ${student.last_name}`;

    const message = type === 'overdue'
      ? `⚠️ *OVERDUE Fee Notice*\n\nDear ${firstName},\n\n` +
        `*${studentName}*'s fee is OVERDUE:\n\n` +
        `📋 ${feeTitle}\n💵 Balance: *${balance}*\n\n` +
        `Please pay immediately.\nType *menu* to pay now.`
      : `💰 *Fee Reminder*\n\nDear ${firstName},\n\n` +
        `*${studentName}*'s fee is due soon:\n\n` +
        `📋 ${feeTitle}\n💵 Balance: *${balance}*\n\n` +
        `Type *menu* to pay now.`;

    try {
      await wa.text(phone, message);
      await feesSvc.saveReminder(invoice.id as string, parent.id, type);
    } catch (err) {
      console.error(`[Cron] Failed to ${phone}:`, err);
    }
  }
}

async function cleanup(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await db.from('bot_sessions').delete().lt('last_activity', twoHoursAgo);
  console.log('[Cron] Sessions cleaned up');
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
