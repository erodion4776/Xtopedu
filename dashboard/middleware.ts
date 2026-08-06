import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // These pages are always public
  const publicPaths = [
    '/login',
    '/payment',
    '/onboarding',
    '/reset-password',
    '/_next',
    '/favicon.ico',
  ];

  // Check if current path is public
  const isPublic = publicPaths.some((p) =>
    pathname.startsWith(p)
  );

  // Always allow public paths
  if (isPublic) {
    return NextResponse.next();
  }

  // Check for Supabase session cookies
  const allCookies = request.cookies.getAll();

  const hasSession = allCookies.some(
    (cookie) =>
      cookie.name === 'sb-access-token' ||
      cookie.name === 'sb-refresh-token' ||
      (cookie.name.startsWith('sb-') &&
        cookie.name.endsWith('-auth-token'))
  );

  // No session - redirect to login
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
