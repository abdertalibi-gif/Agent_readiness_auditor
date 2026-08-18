import { NextResponse, type NextRequest } from "next/server";

// Must stay in sync with AUTH_COOKIE in lib/auth.ts. Inlined here because
// middleware runs on the edge and cannot import "use client" modules.
const AUTH_COOKIE = "ara_token";

// Application routes that require an authenticated session.
const PROTECTED_PREFIXES = ["/dashboard", "/audits", "/audit", "/reports", "/reviews", "/settings", "/websites", "/team", "/usage", "/help"];

// Auth pages that an already-authenticated user should not stay on.
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

function matches(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (matches(PROTECTED_PREFIXES, pathname) && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (matches(AUTH_PAGES, pathname) && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};