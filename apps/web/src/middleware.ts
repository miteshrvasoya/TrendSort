import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: the API's httpOnly cookie is shared across localhost ports. The API still verifies it. */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("tb_token");
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  if (!has && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (has && isLogin) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
