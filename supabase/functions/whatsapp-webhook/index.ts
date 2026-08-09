// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (LEAD CAPTURE + PRICING + ADMIN DEMO)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { getSupabase } from '../_shared/supabase.ts';
import { WhatsApp } from '../_shared/whatsapp.ts';
import type { WebhookBody, IncomingMessage } from '../_shared/types.ts';

const db = getSupabase();

// Simple in-memory state for lead capture (lasts until function restarts)
const leadState = new Map<string, { step: string, data: any }>();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) return new Response(challenge ?? '', { status: 200 });
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body: WebhookBody = await req.json();
      await processWebhook(body);
      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[Webhook Error]', err);
      return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
  }
  return new Response('Method Not Allowed', { status: 405 });
});

async function processWebhook(body: WebhookBody): Promise<void> {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value || !value.messages?.length) return;

  const message = value.messages[0];
  const phone = message.from;
  const wa = new WhatsApp();
  const input = getInput(message);
  const rawText = getRawText(message);
  const formattedPhone = phone.replace(/\D/g, '').replace(/^0/, '234');

  // ── Super Admin Check ────────────────────
  const superAdminPhone = Deno.env.get('SUPER_ADMIN_PHONE');
  if (formattedPhone === superAdminPhone?.replace(/\D/g, '')) {
    await handleSuperAdminFlow(phone, input, wa);
    return;
  }

  // ── Lead Capture State Machine ────────────────────
  const state = leadState.get(phone);
  if (state) {
    if (input === 'cancel') {
        leadState.delete(phone);
        await wa.text(phone, "Registration cancelled. Type 'hi' to see the demo again.");
        return;
    }
    await handleLeadCapture(phone, state, rawText, wa);
    return;
  }

  // ── Routing ────────────────────
  switch (input) {
    case 'hi': case 'hello': case 'menu':
      await showDemoMenu(phone, wa);
      break;
    case 'demo_attendance':
      await wa.text(phone, `✅ *Attendance Demo (Parent View)*\n\nWhen a teacher marks a student absent, the parent gets this:\n\n❌ *Absence Alert*\nYour child *Chidi Okonkwo* was marked absent today.\n🏫 Class: JSS 3A\n\n*Results:* 98% of parents say this gives them peace of mind!`);
      break;
    case 'demo_fees':
      await wa.text(phone, `💰 *Fee Demo (Parent View)*\n\nParent sees their balance and a pay button:\n\nOutstanding: *${fmt(50000)}*\n\nThey tap "Pay Now", use Transfer or Card, and the school gets *100%* of the money instantly. ✅`);
      break;
    case 'demo_admin':
      await showSchoolAdminDemo(phone, wa);
      break;
    case 'demo_pricing':
      await showPricing(phone, wa);
      break;
    case 'register_school':
      leadState.set(phone, { step: 'NAME', data: {} });
      await wa.text(phone, `🏫 *Start Registration*\n\nI will help you set up your school. First, what is your *Full Name*?\n\n_(Type 'cancel' to stop)_`);
      break;
    default:
      await wa.text(phone, `Welcome to *SchoolBot*! 👋\nType *hi* to see how we help schools manage attendance and fees.`);
  }
}

async function showDemoMenu(phone: string, wa: WhatsApp) {
  await wa.list(phone, '🏫 SchoolBot Demo', 
    "Welcome! Explore how SchoolBot works for Parents and Admins.",
    "Powered by XtopEdu", "🎯 Explore", [
    {
      title: "Demos",
      rows: [
        { id: "DEMO_ATTENDANCE", title: "✅ Attendance Demo", description: "What parents see" },
        { id: "DEMO_FEES", title: "💰 Fee Payment Demo", description: "How parents pay" },
        { id: "DEMO_ADMIN", title: "👨‍💼 School Admin Demo", description: "How you manage the school" },
        { id: "DEMO_PRICING", title: "💵 Pricing & Plans", description: "Termly platform fees" },
        { id: "REGISTER_SCHOOL", title: "🚀 Register My School", description: "Get started today" },
      ]
    }
  ]);
}

async function showSchoolAdminDemo(phone: string, wa: WhatsApp) {
  await wa.text(phone, `👨‍💼 *School Admin Demo*\n\nAs an Admin, you can:\n\n1. *Mark Attendance:* Select a class and tap P, A, L, or E for each student. Parents are notified immediately.\n\n2. *Record Payments:* If a parent pays cash, you record it here to update their balance.\n\n3. *Broadcast:* Send a single message to ALL parents in the school or a specific class.\n\n4. *Reports:* Get a daily summary of total money collected and attendance rates.`);
}

async function showPricing(phone: string, wa: WhatsApp) {
  await wa.text(phone, `💵 *Termly Platform Fees*\n\nOur pricing is based on student count, paid once per term:\n\n🌱 1-100 students: *${fmt(15000)}/term*\n🚀 101-300 students: *${fmt(25000)}/term*\n🏢 301-500 students: *${fmt(35000)}/term*\n🏆 501-1000 students: *${fmt(50000)}/term*\n\n*Note:* Parents pay a small 1.5% commission on fee payments. Your school keeps *100%* of the fee!`);
}

async function handleLeadCapture(phone: string, state: any, text: string, wa: WhatsApp) {
  if (state.step === 'NAME') {
    state.data.name = text;
    state.step = 'SCHOOL';
    leadState.set(phone, state);
    await wa.text(phone, `Nice to meet you, *${text}*! What is the name of your *School*?`);
  } else if (state.step === 'SCHOOL') {
    state.data.school = text;
    state.step = 'COUNT';
    leadState.set(phone, state);
    await wa.list(phone, 'Student Count', "Roughly how many students do you have?", "", "Select", [
        { title: "Size", rows: [
            { id: "1-100", title: "1 to 100" },
            { id: "101-300", title: "101 to 300" },
            { id: "301-500", title: "301 to 500" },
            { id: "501-1000", title: "501 to 1000" },
        ]}
    ]);
  } else {
    // Save to database
    const studentCount = text; // From list selection
    const { error } = await db.from('leads').insert({
        contact_name: state.data.name,
        school_name: state.data.school,
        student_count: studentCount,
        phone: phone,
        status: 'new'
    });

    if (error) {
        await wa.text(phone, "Sorry, there was an error saving your details. Please try again later.");
    } else {
        await wa.text(phone, `🎉 *Registration Submitted!*\n\nThank you, ${state.data.name}. We have received your request for *${state.data.school}*.\n\nOur team will contact you on this number shortly to set up your account.`);
        
        // Notify Super Admin
        const superAdminPhone = Deno.env.get('SUPER_ADMIN_PHONE');
        if (superAdminPhone) {
            const botWa = new WhatsApp();
            await botWa.text(superAdminPhone, `🧲 *New Lead Alert!*\n\nName: ${state.data.name}\nSchool: ${state.data.school}\nStudents: ${studentCount}\nPhone: ${phone}`);
        }
    }
    leadState.delete(phone);
  }
}

async function handleSuperAdminFlow(phone: string, input: string, wa: WhatsApp) {
    // Reuse your working Admin menu logic here...
    await wa.text(phone, "🔐 *Super Admin Menu*\nWelcome back owner. (Summary of schools and revenue would go here)");
}

function getInput(message: IncomingMessage): string {
  if (message.type === 'text') return message.text?.body?.trim().toLowerCase() ?? '';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.id?.toLowerCase() ?? message.interactive?.list_reply?.id?.toLowerCase() ?? '';
  }
  return '';
}

function getRawText(message: IncomingMessage): string {
  return message.type === 'text' ? message.text?.body?.trim() ?? '' : (message.interactive?.list_reply?.title ?? '');
}
