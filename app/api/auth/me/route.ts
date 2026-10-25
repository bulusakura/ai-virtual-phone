import { NextResponse } from "next/server";

import {
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SESSION_MAX_AGE_SECONDS,
  getCurrentAccount,
  readCookie,
} from "@/lib/server/account-auth";
import { ACCOUNT_GATE_COOKIE } from "@/lib/account-cookie-constants";
import { createAccountGateCookieValue } from "@/lib/account-gate-cookie";
import { formatSupabaseRestError, getSupabaseServerConfig } from "@/lib/server/supabase-rest";

function authSetupError(message: string): string {
  if (/app_users|activation_codes|app_sessions|schema cache|does not exist|PGRST/i.test(message)) {
    return "账号表尚未创建：请先在 Supabase SQL Editor 执行 docs/account-supabase.sql。";
  }
  return formatSupabaseRestError(message);
}

export async function GET(request: Request) {
  try {
    if (!getSupabaseServerConfig()) {
      return NextResponse.json({ ok: false, account: null, error: "Supabase 环境变量未配置。" }, { status: 503 });
    }
    const account = await getCurrentAccount(request);
    const response = NextResponse.json({ ok: true, account });
    const sessionToken = readCookie(request, ACCOUNT_SESSION_COOKIE);
    if (account && sessionToken) {
      const gateCookie = await createAccountGateCookieValue(sessionToken, ACCOUNT_SESSION_MAX_AGE_SECONDS);
      if (gateCookie) {
        response.cookies.set(ACCOUNT_GATE_COOKIE, gateCookie, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: ACCOUNT_SESSION_MAX_AGE_SECONDS,
        });
      }
    } else {
      response.cookies.set(ACCOUNT_GATE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, account: null, error: authSetupError(err instanceof Error ? err.message : String(err)) },
      { status: getSupabaseServerConfig() ? 500 : 503 },
    );
  }
}
