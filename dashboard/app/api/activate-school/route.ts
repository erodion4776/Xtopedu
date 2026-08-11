import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const db   = createServerClient();
    const body = await req.json();

    const {
      token,
      schoolId,
      phoneNumberId,
      wabaId,
    } = body;

    if (!token || !schoolId || !phoneNumberId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify token is valid and not used
    const { data: tokenData, error: tokenError } =
      await db
        .from('school_activation_tokens')
        .select('id, expires_at, used')
        .eq('token', token)
        .eq('school_id', schoolId)
        .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      );
    }

    if (tokenData.used) {
      return NextResponse.json(
        { error: 'Token already used' },
        { status: 400 }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Token expired' },
        { status: 400 }
      );
    }

    // Use system user token to manage this WABA
    const appToken =
      process.env.META_APP_TOKEN ?? '';

    // Save WhatsApp account
    const { error: waError } = await db
      .from('whatsapp_accounts')
      .upsert(
        {
          school_id:       schoolId,
          phone_number_id: phoneNumberId,
          access_token:    appToken,
          waba_id:         wabaId || null,
          status:          'active',
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'school_id' }
      );

    if (waError) throw waError;

    // Activate school
    await db
      .from('schools')
      .update({
        is_active:         true,
        onboarding_status: 'active',
        updated_at:        new Date().toISOString(),
      })
      .eq('id', schoolId);

    // Mark token as used
    await db
      .from('school_activation_tokens')
      .update({
        used:    true,
        used_at: new Date().toISOString(),
      })
      .eq('id', tokenData.id);

    // Send confirmation WhatsApp to school admin
    try {
      const { data: onboarding } = await db
        .from('school_onboarding')
        .select('admin_phone')
        .eq('school_id', schoolId)
        .single();

      const { data: school } = await db
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single();

      if (onboarding?.admin_phone && appToken) {
        const apiUrl =
          'https://graph.facebook.com/v18.0';
        await fetch(
          `${apiUrl}/${phoneNumberId}/messages`,
          {
            method:  'POST',
            headers: {
              Authorization:  `Bearer ${appToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: onboarding.admin_phone
                .replace(/\D/g, ''),
              type: 'text',
              text: {
                body:
                  `🎉 *${school?.name} is now LIVE!*\n\n` +
                  `Your SchoolBot is activated!\n\n` +
                  `Type *menu* to get started! 🚀`,
              },
            }),
          }
        );
      }
    } catch (notifyErr) {
      // Non-critical
      console.warn('Notification error:', notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ActivateSchool] error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
