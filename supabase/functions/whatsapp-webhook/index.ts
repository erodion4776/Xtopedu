// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (REALISTIC DEMO VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

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
    await sendText(
      phone,
      `✅ *Parent Attendance Experience*\n\n` +
        `This is what a parent sees on WhatsApp:\n\n` +
        `━━━━━━━━━━━━\n` +
        `📅 *Today's Attendance*\n` +
        `👤 Chidi Okonkwo\n` +
        `🏫 JSS 3A\n` +
        `📌 Status: ✅ Present\n` +
        `⏰ Arrival: 07:45 AM\n\n` +
        `📊 *Term Summary*\n` +
        `Rate: 94%\n` +
        `✅ Present: 47 days\n` +
        `❌ Absent: 2 days\n` +
        `⏰ Late: 1 day\n` +
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
    await sendText(
      phone,
      `💰 *Parent Fee Experience*\n\n` +
        `This is what a parent sees:\n\n` +
        `━━━━━━━━━━━━\n` +
        `💰 *Outstanding Fees*\n` +
        `👤 Chidi Okonkwo - JSS 3A\n\n` +
        `1. First Term School Fees\n` +
        `   💵 ₦75,000 remaining\n` +
        `   📅 Due: 31 Dec 2026\n\n` +
        `2. PTA Levy\n` +
        `   💵 ₦15,000\n\n` +
        `━━━━━━━━━━━━\n` +
        `💵 *Total: ₦90,000*\n` +
        `━━━━━━━━━━━━\n\n` +
        `Then parent taps *Pay Now*.`
    );

    await delay(1000);

    await sendText(
      phone,
      `💳 *Payment Breakdown*\n\n` +
        `School Fee:     ₦50,000\n` +
        `1.5% Fee:       ₦750\n` +
        `Processing Fee: ₦125\n` +
        `━━━━━━━━━━━━\n` +
        `Parent Pays:    ₦50,875\n\n` +
        `🏫 The school still receives the full ₦50,000.`
    );

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
    await sendText(
      phone,
      `🚗 *Parent Pickup Experience*\n\n` +
        `When the child is picked up,\n` +
        `this is what the parent sees:\n\n` +
        `━━━━━━━━━━━━\n` +
        `🚗 *Pickup Notification*\n` +
        `✅ Amara Adeleke has been picked up!\n` +
        `👤 Picked up by: Mrs. Funmi Adeleke\n` +
        `👥 Relationship: Mother\n` +
        `⏰ Time: 2:30 PM\n` +
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
    await sendText(
      phone,
      `🧾 *Parent Receipt Experience*\n\n` +
        `After payment, parent receives:\n\n` +
        `━━━━━━━━━━━━\n` +
        `🧾 *PAYMENT RECEIPT*\n` +
        `Receipt No: GFA-RCP-2608-1001\n` +
        `Student: Chidi Okonkwo\n` +
        `Fee: First Term School Fees\n` +
        `Amount Paid: ₦50,000\n` +
        `Method: Bank Transfer\n` +
        `Ref: SCH-ABC123\n` +
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
        `━━━━━━━━━━━━`
    );

    await delay(1000);

    await sendText(
      phone,
      `✅ *Attendance Marking Example*\n\n` +
        `Admin selects class:\n` +
        `• JSS 1A\n` +
        `• JSS 1B\n\n` +
        `Then bot shows one student:\n\n` +
        `👤 John Doe\n` +
        `📋 ADM/2026/001\n\n` +
        `Mark as:\n` +
        `✅ Present\n` +
        `❌ Absent\n` +
        `⏰ Late`
    );

    await delay(1000);

    await sendText(
      phone,
      `💰 *Fee Management Example*\n\n` +
        `Admin can:\n` +
        `• Search student by name\n` +
        `• View outstanding invoices\n` +
        `• Record cash payment\n` +
        `• Send fee receipt\n` +
        `• View collection report\n\n` +
        `Everything happens inside WhatsApp.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Would you like to see pricing now?`,
      [
        { id: 'PRICING', title: '💵 Pricing' },
        { id: 'REGISTER', title: '🏫 Register' },
        { id: 'MAIN_MENU', title: '↩️ Back' },
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
