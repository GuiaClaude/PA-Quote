import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie → sign-in page. The cookie itself is verified on the server for every page.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("pa_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|logout|_next|favicon.ico|api/health).*)"],
};
