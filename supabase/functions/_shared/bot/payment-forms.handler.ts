// ============================================================
// SCHOOLBOT - PAYMENT FORMS HANDLER
// _shared/bot/payment-forms.handler.ts
// ✅ Full support for dynamic charges & custom receipts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { getSupabase } from '../supabase.ts';
import { formatPhone, delay, fmt } from '../utils.ts';

const db = getSupabase();

export async function checkPaymentFormCommand(input: string): Promise<boolean> {
  const { data } = await db.from('payment_forms').select('id').eq('command', input.toLowerCase().trim()).eq('is_active', true).maybeSingle();
  return !!data;
}

export async function hasActiveFormSession(phone: string): Promise<boolean> {
  const { data } = await db.from('payment_form_sessions').select('id').eq('phone', formatPhone(phone)).in('status', ['collecting', 'paying']).maybeSingle();
  return !!data;
}

export async function handlePaymentFormMessage(phone: string, input: string, rawText: string, wa: WhatsApp): Promise<boolean> {
  const { data: session } = await db.from('payment_form_sessions').select(`*, payment_forms (*, payment_form_fields (*))`).eq('phone', formatPhone(phone)).in('status', ['collecting', 'paying']).maybeSingle();
  if (session) { await handleFormCollection(phone, rawText, session, wa); return true; }
  const { data: form } = await db.from('payment_forms').select(`*, payment_form_fields (*)`).eq('command', input.toLowerCase().trim()).eq('is_active', true).maybeSingle();
  if (form) { await startFormCollection(phone, form, wa); return true; }
  return false;
}

async function startFormCollection(phone: string, form: any, wa: WhatsApp): Promise<void> {
  const fields = (form.payment_form_fields as any[]).sort((a, b) => a.order_index - b.order_index);
  if (!fields.length) { await wa.text(phone, `❌ Form has no fields.`); return; }
  await db.from('payment_form_sessions').upsert({ phone: formatPhone(phone), form_id: form.id, current_field: 0, collected: {}, status: 'collecting' }, { onConflict: 'phone' });
  await wa.text(phone, `🎯 *${form.title}*\n\n${form.description ?? ''}\n💵 Amount: *${fmt(form.amount)}*\n\nType *CANCEL* to stop.`);
  await delay(600);
  await askField(phone, fields[0], 1, fields.length, wa);
}

async function handleFormCollection(phone: string, rawText: string, session: any, wa: WhatsApp): Promise<void> {
  if (rawText.trim().toUpperCase() === 'CANCEL') {
    await db.from('payment_form_sessions').delete().eq('phone', formatPhone(phone));
    await wa.text(phone, `❌ Cancelled.`); return;
  }
  const fields = (session.payment_forms.payment_form_fields as any[]).sort((a, b) => a.order_index - b.order_index);
  const idx = session.current_field;
  const field = fields[idx];
  if (!field) { await generatePaymentLink(phone, session, wa); return; }
  
  const val = rawText.trim();
  const collected = { ...session.collected, [field.field_key]: val };
  const nextIdx = idx + 1;

  await db.from('payment_form_sessions').update({ collected, current_field: nextIdx }).eq('phone', formatPhone(phone));

  if (nextIdx < fields.length) await askField(phone, fields[nextIdx], nextIdx + 1, fields.length, wa);
  else await showFormSummary(phone, session.payment_forms, collected, wa);
}

async function askField(phone: string, field: any, curr: number, tot: number, wa: WhatsApp) {
  await wa.text(phone, `📝 *Step ${curr} of ${tot}*\nEnter your *${field.field_label}*${field.required ? '' : ' (optional)'}:`);
}

async function showFormSummary(phone: string, form: any, collected: any, wa: WhatsApp) {
  const summary = Object.entries(collected).map(([k, v]) => `*${k.replace(/_/g, ' ')}:* ${v}`).join('\n');
  await wa.buttons(phone, `📋 *Confirm Details*\n\n${summary}\n\n💵 Amount: *${fmt(form.amount)}*`, [{ id: 'form_confirm', title: '✅ Pay' }, { id: 'form_restart', title: '🔄 Reset' }]);
}

export async function handleFormButton(phone: string, input: string, wa: WhatsApp): Promise<boolean> {
  if (input === 'form_confirm') {
    const { data: s } = await db.from('payment_form_sessions').select(`*, payment_forms(*)`).eq('phone', formatPhone(phone)).maybeSingle();
    if (s) await generatePaymentLink(phone, s, wa);
    return true;
  }
  if (input === 'form_restart') { await db.from('payment_form_sessions').delete().eq('phone', formatPhone(phone)); await wa.text(phone, `🔄 Reset.`); return true; }
  return false;
}

async function generatePaymentLink(phone: string, session: any, wa: WhatsApp) {
  const form = session.payment_forms;
  const base = form.amount;
  let charge = 0;
  if (form.charge_type === 'flat') charge = form.charge_value;
  else if (form.charge_type === 'percentage') charge = base * (form.charge_value / 100);

  const total = form.charge_bearer === 'customer' ? base + charge : base;
  const ref = `FORM-${Date.now().toString(36).toUpperCase()}`;

  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: session.collected.email ?? `${formatPhone(phone)}@xtop.ng`,
        amount: Math.round(total * 100),
        reference: ref,
        callback_url: `${Deno.env.get('APP_URL')}/functions/v1/payment-callback?type=form_payment&ref=${ref}`,
        metadata: { payment_type: 'form_payment', phone: formatPhone(phone), form_id: form.id, collected: session.collected, total_amount: total, base_amount: base, charge_amount: charge }
      })
    });
    const d = await res.json();
    await wa.text(phone, `💳 *Payment Link Ready*\n\nTotal: *${fmt(total)}*\n\n👇 Tap to pay:\n${d.data.authorization_url}`);
  } catch (err) { console.error(err); }
}

export async function handleFormPaymentSuccess(ref: string, meta: any) {
  const { data: serial } = await db.rpc('get_next_serial', { p_form_id: meta.form_id });
  await db.from('payment_form_payments').insert({ form_id: meta.form_id, phone: meta.phone, data: meta.collected, amount: meta.amount, status: 'Success', serial_number: serial, gateway_ref: ref });
  await db.from('payment_form_sessions').delete().eq('phone', meta.phone);
  const wa = new WhatsApp();
  await wa.text(meta.phone, `🎉 *Payment Successful*\n\nSerial No: #${String(serial).padStart(3, '0')}\n\n${meta.completion_message ?? 'Thank you for your payment!'}`);
}
