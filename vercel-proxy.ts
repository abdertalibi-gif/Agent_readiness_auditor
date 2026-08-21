// Vercel Routing Middleware (proxy) — runs on Node.js runtime
// Replicates frontend/middleware.ts auth logic for Vercel Services compatibility

const AUTH_COOKIE = "ara_token";

const PROTECTED_PREFIXES = ["/dashboard", "/audits", "/audit", "/reports", "/reviews", "/settings", "/websites", "/team", "/usage", "/help"];

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

function matches(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function getCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...valParts] = cookie.split("=");
    if (key === name) return valParts.join("=");
  }
  return undefined;
}

export default function proxy(request: Request) {
  const url = new URL(request.url);
  const { pathname } = url;
  const cookieHeader = request.headers.get("cookie");
  const token = getCookie(cookieHeader, AUTH_COOKIE);

  if (matches(PROTECTED_PREFIXES, pathname) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return Response.redirect(loginUrl, 307);
  }

  if (matches(AUTH_PAGES, pathname) && token) {
    const dashboardUrl = new URL("/dashboard", request.url);
    dashboardUrl.searchParams.delete("next");
    return Response.redirect(dashboardUrl, 307);
  }

  return new Response(null, { status: 204 }); // pass through
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};