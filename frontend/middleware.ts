import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "ara_token";

const PROTECTED_PREFIXES = ["/dashboard", "/audits", "/audit", "/reports", "/reviews", "/settings", "/websites", "/team", "/usage", "/help"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

function matches(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  const response = matches(PROTECTED_PREFIXES, pathname) && !token
    ? (() => {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      })()
    : matches(AUTH_PAGES, pathname) && token
      ? (() => {
          const url = request.nextUrl.clone();
          url.pathname = "/dashboard";
          url.searchParams.delete("next");
          return NextResponse.redirect(url);
        })()
      : NextResponse.next();

  // For API routes proxied to the backend, forward the real client IP.
  // Render's proxy sets X-Forwarded-For to the user's real IP. We extract it
  // and set X-Real-IP so the backend rate-limits per end-user, not per
  // frontend server.
  if (pathname.startsWith("/api/")) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const clientIp = forwardedFor.split(",")[0].trim();
      if (clientIp) {
        response.headers.set("x-real-ip", clientIp);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
