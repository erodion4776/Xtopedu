// ============================================================
// SCHOOLBOT - ADMIN BROADCAST FLOW
// supabase/functions/_shared/bot/admin/admin.broadcast.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService } from '../../services/admin.service.ts';
import { showAdminMenu } from './admin.menu.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();

// ─── Start broadcast flow ──────────────────────────────────────────────────
export async function startBroadcast(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `📢 *Broadcast Message*\n\n` +
    `Send a WhatsApp message to\n` +
    `your parents.\n\n` +
    `Who should receive this message?`,
    [
      { id: 'BROADCAST_ALL', title: '🌍 All Parents' },
      { id: 'BROADCAST_CLASS', title: '🏫 By Class' },
      { id: 'BROADCAST_DEBTORS', title: '💰 Fee Defaulters' },
    ],
    'Broadcast Message'
  );

  await sessions.setState(phone, 'ADMIN_BROADCAST_MENU');
}

// ─── Handle broadcast menu selection ──────────────────────────────────────
export async function handleBroadcastMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'broadcast_all':
      await promptBroadcastMessage(
        phone,
        session,
        'all_parents',
        '🌍 All Parents',
        null,
        wa
      );
      break;

    case 'broadcast_class':
      await showClassSelector(phone, session, wa);
      break;

    case 'broadcast_debtors':
      await promptBroadcastMessage(
        phone,
        session,
        'debtors',
        '💰 Parents with Outstanding Fees',
        null,
        wa
      );
      break;

    default:
      await startBroadcast(phone, session, wa);
  }
}

// ─── Show class selector for broadcast ────────────────────────────────────
async function showClassSelector(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const classes = await adminSvc.getClasses(session.school_id);

  if (!classes.length) {
    await wa.text(
      phone,
      `❌ No classes found.\n\n` +
      `Add classes first before\n` +
      `broadcasting to class parents.`
    );
    return;
  }

  // Build rows
  const rows: Array<{
    id: string;
    title: string;
    description?: string;
  }> = [];

  for (const cls of classes as Record<string, unknown>[]) {
    const arms = cls.class_arms as Array<{
      id: string;
      name: string;
    }> | null;

    if (arms?.length) {
      for (const arm of arms) {
        rows.push({
          id: `BCAST_CLASS_${cls.id}_ARM_${arm.id}`,
          title: `${cls.name} ${arm.name}`.substring(0, 24),
          description: 'Send to parents in this class',
        });
      }
    } else {
      rows.push({
        id: `BCAST_CLASS_${cls.id}_ARM_NONE`,
        title: String(cls.name).substring(0, 24),
        description: 'Send to parents in this class',
      });
    }
  }

  await wa.list(
    phone,
    `🏫 Select Class`,
    `Which class parents should\n` +
    `receive this message?`,
    `Tap a class to continue`,
    `🏫 Choose Class`,
    [{ title: 'Classes', rows: rows.slice(0, 10) }]
  );

  await sessions.setState(phone, 'ADMIN_BROADCAST_MENU');
}

// ─── Handle broadcast target selection ────────────────────────────────────
export async function handleBroadcastTarget(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('bcast_class_')) {
    await startBroadcast(phone, session, wa);
    return;
  }

  // Parse: bcast_class_{classId}_arm_{armId or NONE}
  const parts = input.split('_');
  const classId = parts[2];
  const armId = parts[4] !== 'none' ? parts[4] : null;

  await promptBroadcastMessage(
    phone,
    session,
    'class_parents',
    '🏫 Class Parents',
    classId,
    wa,
    armId
  );
}

// ─── Prompt admin to type message ─────────────────────────────────────────
async function promptBroadcastMessage(
  phone: string,
  session: BotSession,
  target: string,
  targetLabel: string,
  classId: string | null,
  wa: WhatsApp,
  armId?: string | null
): Promise<void> {
  await wa.text(
    phone,
    `📢 *Compose Broadcast*\n\n` +
    `📨 *To:* ${targetLabel}\n\n` +
    `Type your message below.\n` +
    `It will be sent exactly as you type it.\n\n` +
    `_Your message:_\n\n` +
    `Type *CANCEL* to go back.`
  );

  // Save target to session
  await sessions.setState(
    phone,
    'ADMIN_BROADCAST_COMPOSE',
    null,
    {
      data: {
        broadcastTarget: target,
        broadcastTargetLabel: targetLabel,
        broadcastClassId: classId,
        broadcastArmId: armId ?? null,
      },
    }
  );
}

// ─── Handle broadcast message composition ─────────────────────────────────
export async function handleBroadcastCompose(
  phone: string,
  session: BotSession,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  const text = rawText.trim();

  // Cancel
  if (text.toLowerCase() === 'cancel') {
    await startBroadcast(phone, session, wa);
    return;
  }

  // Message too short
  if (text.length < 5) {
    await wa.text(
      phone,
      `⚠️ Message too short.\n\n` +
      `Please type a proper message\n` +
      `to send to parents.`
    );
    return;
  }

  // Message too long for WhatsApp
  if (text.length > 4000) {
    await wa.text(
      phone,
      `⚠️ Message too long.\n\n` +
      `Please shorten your message.\n` +
      `Maximum 4000 characters.`
    );
    return;
  }

  const target = session.data?.broadcastTarget as string;
  const targetLabel =
    session.data?.broadcastTargetLabel as string;

  // Show preview before sending
  await wa.buttons(
    phone,
    `📢 *Preview Broadcast*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📨 *To:* ${targetLabel}\n\n` +
    `💬 *Message:*\n${text}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Send this message?`,
    [
      { id: 'BROADCAST_SEND', title: '✅ Send Now' },
      { id: 'BROADCAST_EDIT', title: '✏️ Edit Message' },
      { id: 'BROADCAST_CANCEL', title: '❌ Cancel' },
    ]
  );

  // Save message to session
  await sessions.setState(
    phone,
    'ADMIN_BROADCAST_CONFIRM',
    null,
    {
      data: {
        ...session.data,
        broadcastMessage: text,
      },
    }
  );
}

// ─── Handle broadcast confirmation ────────────────────────────────────────
export async function handleBroadcastConfirm(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Cancel
  if (input === 'broadcast_cancel') {
    await startBroadcast(phone, session, wa);
    return;
  }

  // Edit - go back to compose
  if (input === 'broadcast_edit') {
    const target = session.data?.broadcastTarget as string;
    const targetLabel =
      session.data?.broadcastTargetLabel as string;
    const classId =
      session.data?.broadcastClassId as string | null;
    const armId =
      session.data?.broadcastArmId as string | null;

    await promptBroadcastMessage(
      phone,
      session,
      target,
      targetLabel,
      classId,
      wa,
      armId
    );
    return;
  }

  // Send
  if (input !== 'broadcast_send') return;

  const message = session.data?.broadcastMessage as string;
  const target = session.data?.broadcastTarget as string;
  const targetLabel =
    session.data?.broadcastTargetLabel as string;
  const classId =
    session.data?.broadcastClassId as string | null;

  if (!message) {
    await startBroadcast(phone, session, wa);
    return;
  }

  // Show sending indicator
  await wa.text(
    phone,
    `⏳ *Sending broadcast to ${targetLabel}...*\n\n` +
    `Please wait.`
  );

  try {
    // Get recipient phones
    const recipients = await adminSvc.getBroadcastTargets(
      session.school_id,
      target as 'all_parents' | 'class_parents' | 'debtors',
      classId ?? undefined
    );

    if (!recipients.length) {
      await wa.buttons(
        phone,
        `❌ *No recipients found*\n\n` +
        `No parents found for this target.\n\n` +
        `Make sure parents have\n` +
        `WhatsApp numbers registered.`,
        [
          { id: 'ADMIN_BROADCAST', title: '📢 Try Again' },
          { id: 'MAIN_MENU', title: '🏠 Menu' },
        ]
      );
      return;
    }

    // Get school WA account for sending
    const waAccount = await adminSvc.getWaAccount(
      session.school_id
    );

    const schoolWa = new WhatsApp(
      waAccount as { phone_number_id: string; access_token: string; status: string } | null
    );

    // Send to each recipient
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await schoolWa.text(recipient.phone, message);
        sent++;

        // Rate limit - WhatsApp allows ~80 messages/second
        // Wait 100ms between each to be safe
        await delay(100);
      } catch (err) {
        console.warn(
          `[Broadcast] Failed to send to ${recipient.phone}:`,
          err
        );
        failed++;
      }
    }

    // Log the broadcast
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'broadcast_message',
      {
        target,
        target_label: targetLabel,
        class_id: classId,
        total_recipients: recipients.length,
        sent,
        failed,
        message_preview: message.substring(0, 100),
      }
    );

    // Success message
    await wa.buttons(
      phone,
      `✅ *Broadcast Sent!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📨 *To:* ${targetLabel}\n\n` +
      `📊 *Results:*\n` +
      `✅ Sent:   *${sent}* messages\n` +
      (failed > 0
        ? `❌ Failed: *${failed}* messages\n`
        : '') +
      `👥 Total:  *${recipients.length}* parents\n` +
      `━━━━━━━━━━━━━━━━`,
      [
        { id: 'ADMIN_BROADCAST', title: '📢 New Broadcast' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
  } catch (err) {
    console.error('[Broadcast] error:', err);
    await wa.text(
      phone,
      `❌ *Broadcast failed*\n\n` +
      `Something went wrong.\n` +
      `Please try again.\n\n` +
      `Error: ${err}`
    );
  }
}

// ─── Delay helper ──────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
