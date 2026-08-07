// dashboard/app/api/admin/[...path]/route.ts

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_API =
  'https://nigloptmadtmsfjqshvm.supabase.co/functions/v1/super-admin-api';

const TOKEN = process.env.SUPER_ADMIN_API_TOKEN ?? '';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params.path, 'GET');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params.path, 'POST');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params.path, 'PATCH');
}

async function proxyRequest(
  req: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    const path = pathSegments.join('/');
    const url = new URL(req.url);
    const queryString = url.search;

    const body = method !== 'GET'
      ? await req.text()
      : undefined;

    const response = await fetch(
      `${SUPABASE_API}/${path}${queryString}`,
      {
        method,
        headers: {
          'x-admin-token': TOKEN,
          'Content-Type': 'application/json',
        },
        body,
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[API Proxy] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
