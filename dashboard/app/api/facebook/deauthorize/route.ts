// When user removes your app from Facebook
// Facebook pings this URL

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('[Facebook] Deauthorize callback');
    // Log the deauthorization
    // You can handle cleanup here if needed
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Facebook] Deauthorize error:', err);
    return NextResponse.json(
      { error: 'Failed' },
      { status: 500 }
    );
  }
}
