import { NextResponse } from "next/server";

import { ACCOUNT_SESSION_COOKIE, deleteSessionToken, readCookie } from "@/lib/server/account-auth";
import { ACCOUNT_GATE_COOKIE } from "@/lib/account-cookie-constants";

export async function POST(request: Request) {
  const token = readCookie(request, ACCOUNT_SESSION_COOKIE);
  await deleteSessionToken(token).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ACCOUNT_GATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
