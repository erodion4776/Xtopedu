// dashboard/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't need auth
  const publicPaths = [
    '/login',
    '/payment',
    '/onboarding',
  ];

  const isPublic = publicPaths.some((p) =>
    pathname.startsWith(p)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // Check for Supabase auth cookie
  const authCookie =
    request.cookies.get(
      `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL
        ?.replace('https://', '')
        .split('.')[0]}-auth-token`
    )?.value ??
    request.cookies.get('sb-access-token')?.value;

  if (!authCookie) {
    return NextResponse.redirect(
      new URL('/login', request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
