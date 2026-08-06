// middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't need auth
  const publicPaths = [
    '/login',
    '/payment/success',
    '/payment/failed',
    '/onboarding/success',
    '/onboarding/failed',
  ];

  const isPublic = publicPaths.some((p) =>
    pathname.startsWith(p)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // Check for auth session
  const token =
    request.cookies.get('sb-access-token')?.value ??
    request.cookies.get('sb-nigloptmadtmsfjqshvm-auth-token')?.value;

  if (!token && !isPublic) {
    return NextResponse.redirect(
      new URL('/login', request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
