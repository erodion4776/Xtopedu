// ============================================================
// SCHOOLBOT - PAYMENT FORMS HANDLER
// _shared/bot/payment-forms.handler.ts
// ✅ Includes custom completion/receipt message
// ✅ Serial number tracking
// ============================================================

import { WhatsApp }    from '../whatsapp.ts';
import { getSupabase } from '../supabase.ts';
import { formatPhone } from '../utils.ts';

const db = getSupabase();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 0,
  }).format(n);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Check if input is a payment form command ─────────────
export async function checkPaymentFormCommand(
  input: string
): Promise<boolean> {
  const { data } = await db
    .from('payment_forms')
    .select('id')
    .eq('command', input.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle();

  return !!data;
}

// ─── Check if phone has active form session ───────────────
export async function hasActiveFormSession(
  phone: string
): Promise<boolean> {
  const { data } = await db
    .from('payment_form_sessions')
    .select('id, status')
    .eq('phone', formatPhone(phone))
    .in('status', ['collecting', 'paying'])
    .maybeSingle();

  return !!data;
}

// ─── Main handler ─────────────────────────────────────────
export async function handlePaymentFormMessage(
  phone:   string,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<boolean> {
  // Check active session first
  const { data: session } = await db
    .from('payment_form_sessions')
    .select(`
      *,
      payment_forms (
        id,
        title,
        description,
        amount,
        bank_name,
        account_number,
        account_name,
        subaccount_code,
        completion_message,
        receipt_title,
        payment_form_fields (
          id,
          field_key,
          field_label,
          field_type,
          required,
          order_index
        )
      )
    `)
    .eq('phone', formatPhone(phone))
    .in('status', ['collecting', 'paying'])
    .maybeSingle();

  if (session) {
    await handleFormCollection(
      phone, rawText, session, wa
    );
    return true;
  }

  // Check if input matches a form command
  const { data: form } = await db
    .from('payment_forms')
    .select(`
      *,
      payment_form_fields (
        id,
        field_key,
        field_label,
        field_type,
        required,
        order_index
      )
    `)
    .eq('command', input.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle();

  if (form) {
    await startFormCollection(phone, form, wa);
    return true;
  }

  return false;
}

// ─── Handle confirm/restart buttons ──────────────────────
export async function handleFormButton(
  phone: string,
  input: string,
  wa:    WhatsApp
): Promise<boolean> {
  if (input === 'form_confirm') {
    const { data: session } = await db
      .from('payment_form_sessions')
      .select(`
        *,
        payment_forms (
          id,
          title,
          amount,
          bank_name,
          account_number,
          account_name,
          subaccount_code,
          completion_message,
          receipt_title
        )
      `)
      .eq('phone', formatPhone(phone))
      .maybeSingle();

    if (session) {
      await generatePaymentLink(phone, session, wa);
      return true;
    }
  }

  if (input === 'form_restart') {
    await db
      .from('payment_form_sessions')
      .delete()
      .eq('phone', formatPhone(phone));

    await wa.text(
      phone,
      `🔄 *Restarted*\n\n` +
      `Type the command again to restart.`
    );
    return true;
  }

  return false;
}

// ─── Start form collection ────────────────────────────────
async function startFormCollection(
  phone: string,
  form:  Record<string, unknown>,
  wa:    WhatsApp
): Promise<void> {
  const fields = (
    form.payment_form_fields as Array<{
      field_key:   string;
      field_label: string;
      field_type:  string;
      required:    boolean;
      order_index: number;
    }>
  ).sort((a, b) => a.order_index - b.order_index);

  if (!fields.length) {
    await wa.text(
      phone,
      `❌ This form has no fields configured.\n\n` +
      `Please contact support.`
    );
    return;
  }

  // Create or reset session
  await db
    .from('payment_form_sessions')
    .upsert(
      {
        phone:         formatPhone(phone),
        form_id:       form.id as string,
        current_field: 0,
        collected:     {},
        status:        'collecting',
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );

  // Welcome message
  await wa.text(
    phone,
    `🎯 *${form.title}*\n\n` +
    (form.description
      ? `${form.description}\n\n`
      : '') +
    `💵 *Amount:* ${fmt(form.amount as number)}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Please fill in the required details.\n\n` +
    `Type *CANCEL* at any time to stop.`
  );

  await delay(800);

  // Ask first field
  await askField(phone, fields[0], 1, fields.length, wa);
}

// ─── Handle form data collection ─────────────────────────
async function handleFormCollection(
  phone:   string,
  rawText: string,
  session: Record<string, unknown>,
  wa:      WhatsApp
): Promise<void> {
  // Cancel
  if (rawText.trim().toUpperCase() === 'CANCEL') {
    await db
      .from('payment_form_sessions')
      .delete()
      .eq('phone', formatPhone(phone));

    await wa.text(
      phone,
      `❌ *Cancelled*\n\n` +
      `Your form has been cancelled.\n\n` +
      `Type the command again to restart.`
    );
    return;
  }

  const form = session.payment_forms as
    Record<string, unknown>;
  const fields = (
    form.payment_form_fields as Array<{
      field_key:   string;
      field_label: string;
      field_type:  string;
      required:    boolean;
      order_index: number;
    }>
  ).sort((a, b) => a.order_index - b.order_index);

  const currentIndex = session.current_field as number;
  const currentField = fields[currentIndex];

  if (!currentField) {
    await generatePaymentLink(phone, session, wa);
    return;
  }

  const value = rawText.trim();

  // Validate required
  if (currentField.required && !value) {
    await wa.text(
      phone,
      `⚠️ *This field is required.*\n\n` +
      `Please enter your *${currentField.field_label}*:`
    );
    return;
  }

  // Validate email
  if (
    currentField.field_type === 'email' &&
    value &&
    !value.includes('@')
  ) {
    await wa.text(
      phone,
      `❌ Invalid email address.\n\n` +
      `Please enter a valid email:`
    );
    return;
  }

  // Validate phone
  if (currentField.field_type === 'phone' && value) {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 10) {
      await wa.text(
        phone,
        `❌ Invalid phone number.\n\n` +
        `Please enter a valid phone number:`
      );
      return;
    }
  }

  // Save field value
  const collected = {
    ...(session.collected as Record<string, string>),
    [currentField.field_key]: value,
  };

  const nextIndex = currentIndex + 1;

  await db
    .from('payment_form_sessions')
    .update({
      collected:     collected,
      current_field: nextIndex,
      updated_at:    new Date().toISOString(),
    })
    .eq('phone', formatPhone(phone));

  if (nextIndex < fields.length) {
    // More fields to collect
    await wa.text(phone, `✅ Got it!`);
    await delay(400);
    await askField(
      phone,
      fields[nextIndex],
      nextIndex + 1,
      fields.length,
      wa
    );
  } else {
    // All fields collected — show summary
    await showFormSummary(
      phone, form, collected, session, wa
    );
  }
}

// ─── Ask a specific field ─────────────────────────────────
async function askField(
  phone:   string,
  field:   {
    field_key:   string;
    field_label: string;
    field_type:  string;
    required:    boolean;
  },
  current: number,
  total:   number,
  wa:      WhatsApp
): Promise<void> {
  const typeHints: Record<string, string> = {
    email:  '\n_Example: name@email.com_',
    phone:  '\n_Example: 08012345678_',
    number: '\n_Enter a number_',
    date:   '\n_Format: DD/MM/YYYY_',
  };

  const hint     = typeHints[field.field_type] ?? '';
  const required = field.required
    ? ''
    : ' _(optional — type *skip* to skip)_';

  await wa.text(
    phone,
    `📝 *Step ${current} of ${total}*\n\n` +
    `Please enter your *${field.field_label}*${required}:` +
    `${hint}`
  );
}

// ─── Show form summary before payment ─────────────────────
async function showFormSummary(
  phone:     string,
  form:      Record<string, unknown>,
  collected: Record<string, string>,
  session:   Record<string, unknown>,
  wa:        WhatsApp
): Promise<void> {
  const fields = (
    form.payment_form_fields as Array<{
      field_key:   string;
      field_label: string;
    }>
  );

  const summaryLines = fields
    .map((f) => {
      const value = collected[f.field_key];
      if (!value || value === 'skip') return null;
      return `*${f.field_label}:* ${value}`;
    })
    .filter(Boolean)
    .join('\n');

  await wa.buttons(
    phone,
    `📋 *Confirm Your Details*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `${summaryLines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Amount to pay:*\n` +
    `*${fmt(form.amount as number)}*\n\n` +
    `Is everything correct?`,
    [
      { id: 'FORM_CONFIRM', title: '✅ Confirm & Pay' },
      { id: 'FORM_RESTART', title: '🔄 Start Over' },
    ]
  );
}

// ─── Generate payment link ────────────────────────────────
async function generatePaymentLink(
  phone:   string,
  session: Record<string, unknown>,
  wa:      WhatsApp
): Promise<void> {
  const form      = session.payment_forms as
    Record<string, unknown>;
  const collected = session.collected as
    Record<string, string>;

  await wa.text(phone, `⏳ Generating payment link...`);

  try {
    const secretKey =
      Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
    const appUrl    =
      Deno.env.get('APP_URL') ?? '';

    const reference =
      `FORM-${Date.now().toString(36).toUpperCase()}-` +
      `${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

    const email =
      collected.email ??
      `${formatPhone(phone)}@payment.ng`;

    const amount = (form.amount as number) * 100;

    const payload: Record<string, unknown> = {
      email,
      amount,
      reference,
      callback_url:
        `${appUrl}/functions/v1/payment-callback` +
        `?type=form_payment&ref=${reference}`,
      metadata: {
        payment_type:       'form_payment',
        form_id:            form.id,
        phone:              formatPhone(phone),
        collected,
        form_title:         form.title,
        completion_message: form.completion_message,
        receipt_title:      form.receipt_title,
      },
    };

    if (form.subaccount_code) {
      payload.subaccount = form.subaccount_code;
      payload.bearer     = 'account';
    }

    const res = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();

    if (!data.status) {
      throw new Error(
        data.message ?? 'Payment init failed'
      );
    }

    // Save payment record (pending)
    await db.from('payment_form_payments').insert({
      form_id:     form.id as string,
      phone:       formatPhone(phone),
      data:        collected,
      amount:      form.amount as number,
      status:      'pending',
      gateway_ref: reference,
      created_at:  new Date().toISOString(),
    });

    // Update session
    await db
      .from('payment_form_sessions')
      .update({
        status:      'paying',
        gateway_ref: reference,
        updated_at:  new Date().toISOString(),
      })
      .eq('phone', formatPhone(phone));

    // Send payment link
    await wa.text(
      phone,
      `💳 *Payment Link Ready!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📋 *${form.title}*\n\n` +
      `💵 *Amount:* ${fmt(form.amount as number)}\n` +
      `🔖 *Ref:* ${reference}\n\n` +
      `👇 *Tap to pay securely:*\n` +
      `${data.data.authorization_url}\n\n` +
      `⏰ Link valid for *30 minutes*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `✅ You will receive confirmation\n` +
      `after payment is complete.`
    );

    // Notify super admin
    const superPhone =
      Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
    if (superPhone) {
      try {
        const notifyWa = new WhatsApp({
          phone_number_id:
            Deno.env.get(
              'WHATSAPP_PHONE_NUMBER_ID'
            ) ?? '',
          access_token:
            Deno.env.get(
              'WHATSAPP_ACCESS_TOKEN'
            ) ?? '',
          status: 'active',
        });

        const details = Object.entries(collected)
          .filter(([, v]) => v && v !== 'skip')
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');

        await notifyWa.text(
          superPhone,
          `💳 *New Payment Initiated*\n\n` +
          `📋 Form: *${form.title}*\n` +
          `💵 Amount: *${
            fmt(form.amount as number)
          }*\n` +
          `📱 Phone: ${formatPhone(phone)}\n\n` +
          `📝 *Details:*\n${details}\n\n` +
          `🔖 Ref: ${reference}\n` +
          `⏰ ${new Date().toLocaleString('en-NG')}`
        );
      } catch {
        // Non-critical
      }
    }
  } catch (err) {
    console.error('[PaymentForm] Error:', err);
    await wa.text(
      phone,
      `❌ *Payment link failed*\n\n` +
      `Please try again or contact support:\n` +
      `*${Deno.env.get('SUPER_ADMIN_PHONE') ?? ''}*`
    );
  }
}

// ─── Handle successful payment (called from callback) ─────
export async function handleFormPaymentSuccess(
  reference: string,
  meta:      Record<string, unknown>
): Promise<void> {
  const phone             = meta.phone      as string;
  const formId            = meta.form_id    as string;
  const amount            = meta.amount     as number;
  const collected         = meta.collected  as
    Record<string, string>;
  const completionMessage = meta.completion_message as
    string | null;
  const receiptTitle      = meta.receipt_title as
    string | null;
  const formTitle         = meta.form_title as string;

  // Get next serial number for this form
  const { data: serialData } = await db.rpc(
    'get_next_serial',
    { p_form_id: formId }
  );

  const serialNumber = serialData as number ?? 1;

  // Update payment record with serial number
  await db
    .from('payment_form_payments')
    .update({
      status:        'Success',
      serial_number: serialNumber,
      paid_at:       new Date().toISOString(),
    })
    .eq('gateway_ref', reference);

  // Clear session
  await db
    .from('payment_form_sessions')
    .delete()
    .eq('phone', phone);

  // Build receipt
  const serialFormatted =
    `#${String(serialNumber).padStart(3, '0')}`;

  const detailLines = Object.entries(collected)
    .filter(([, v]) => v && v !== 'skip')
    .map(([k, v]) => {
      const label = k
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `*${label}:* ${v}`;
    })
    .join('\n');

  // Use platform WA to send receipt
  const wa = new WhatsApp({
    phone_number_id:
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    access_token:
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
    status: 'active',
  });

  // Send receipt to payer
  await wa.text(
    phone,
    `🎉 *Payment Confirmed!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📋 *${receiptTitle ?? formTitle}*\n` +
    `🔢 *Serial No:* ${serialFormatted}\n\n` +
    `${detailLines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Amount Paid:* ${fmt(amount)}\n` +
    `🔖 *Ref:* ${reference}\n` +
    `📅 ${new Date().toLocaleDateString('en-NG', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
    })}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    (completionMessage
      ? `${completionMessage}\n\n`
      : '') +
    `Thank you! 🙏`
  );

  // Notify super admin with serial number
  const superPhone =
    Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
  if (superPhone) {
    try {
      await wa.text(
        superPhone,
        `💰 *Payment Received!*\n\n` +
        `📋 Form: *${formTitle}*\n` +
        `🔢 Serial: *${serialFormatted}*\n` +
        `💵 Amount: *${fmt(amount)}*\n` +
        `📱 Phone: ${phone}\n\n` +
        `📝 *Details:*\n${detailLines}\n\n` +
        `🔖 Ref: ${reference}\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    } catch {
      // Non-critical
    }
  }
}
