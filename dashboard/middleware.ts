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

  // Check for Supabase session cookie
  // Supabase stores auth in cookies
  const hasSession =
    request.cookies.has('sb-access-token') ||
    request.cookies.has('sb-refresh-token') ||
    // Supabase v2 cookie format
    Array.from(request.cookies.keys()).some((key) =>
      key.startsWith('sb-') && key.endsWith('-auth-token')
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
