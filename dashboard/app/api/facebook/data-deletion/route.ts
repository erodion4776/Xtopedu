// When user requests data deletion from Facebook
// Facebook pings this URL
// Must return a confirmation code and status URL

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData();
    const signedRequest = body.get('signed_request');

    if (!signedRequest) {
      return NextResponse.json(
        { error: 'No signed_request' },
        { status: 400 }
      );
    }

    // Generate unique confirmation code
    const confirmationCode = crypto
      .randomBytes(16)
      .toString('hex');

    // Return required response format
    // Facebook requires this exact format
    return NextResponse.json({
      url: `https://xtopedu.netlify.app/data-deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error('[Facebook] Data deletion error:', err);
    return NextResponse.json(
      { error: 'Failed' },
      { status: 500 }
    );
  }
}
