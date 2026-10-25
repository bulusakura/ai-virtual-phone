import { NextResponse } from "next/server";

import {
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SESSION_MAX_AGE_SECONDS,
  ACTIVATION_RPC_MISSING,
  cleanAccountText,
  createSession,
  createUser,
  findUserByUsername,
  isValidUsername,
  markActivationCodeUsed,
  normalizeUsername,
  registerAccountWithCode,
  toPublicAccount,
  touchUserLogin,
  validateActivationCode,
  verifyPassword,
} from "@/lib/server/account-auth";
import { ACCOUNT_GATE_COOKIE } from "@/lib/account-cookie-constants";
import { createAccountGateCookieValue } from "@/lib/account-gate-cookie";
import {
  getLoginClientIp,
  loginLockedMinutes,
  recordLoginFailure,
} from "@/lib/server/login-rate-limit";
import { formatSupabaseRestError, getSupabaseServerConfig } from "@/lib/server/supabase-rest";

function authSetupError(message: string): string {
  if (/app_users|activation_codes|app_sessions|schema cache|does not exist|PGRST/i.test(message)) {
    return "账号表尚未创建：请先在 Supabase SQL Editor 执行 docs/account-supabase.sql。";
  }
  return formatSupabaseRestError(message);
}

export async function POST(request: Request) {
  try {
    if (!getSupabaseServerConfig()) {
      return NextResponse.json({ ok: false, error: "Supabase 环境变量未配置。" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const username = normalizeUsername(record.username);
    const password = cleanAccountText(record.password, 120);
    const activationCode = cleanAccountText(record.activationCode, 120);

    if (!isValidUsername(username)) {
      return NextResponse.json({ ok: false, error: "账号需为 3-40 位字母、数字、下划线、邮箱符号、点或短横线。" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: "密码至少需要 6 位。" }, { status: 400 });
    }

    const clientIp = getLoginClientIp(request);
    const lockedMinutes = loginLockedMinutes(clientIp);
    if (lockedMinutes > 0) {
      return NextResponse.json(
        { ok: false, error: `失败次数过多，请约 ${lockedMinutes} 分钟后再试。` },
        { status: 429 },
      );
    }

    let user = await findUserByUsername(username);

    if (user) {
      if (user.status === "disabled") {
        return NextResponse.json({ ok: false, error: "账号已被停用。" }, { status: 403 });
      }
      if (!verifyPassword(password, cleanAccountText(user.password_hash, 300))) {
        recordLoginFailure(clientIp);
        return NextResponse.json({ ok: false, error: "账号或密码错误。" }, { status: 401 });
      }
    } else {
      if (!activationCode) {
        return NextResponse.json({ ok: false, error: "首次使用该账号需要填写激活码。" }, { status: 400 });
      }
      const displayName = cleanAccountText(record.displayName, 80) || username;
      try {
        // Atomic: claim the code + create the account in one locked transaction
        // so concurrent first-time registrations can't over-redeem a code.
        user = await registerAccountWithCode({ username, password, displayName, activationCode });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message !== ACTIVATION_RPC_MISSING) {
          // 无效激活码也计入失败:防止拿注册接口枚举激活码
          recordLoginFailure(clientIp);
          return NextResponse.json({ ok: false, error: message }, { status: 400 });
        }
        // RPC not installed yet (account-supabase.sql not run): fall back to the
        // legacy non-atomic flow so registration keeps working.
        try {
          await validateActivationCode(activationCode);
        } catch (legacyErr) {
          recordLoginFailure(clientIp);
          throw legacyErr;
        }
        user = await createUser({ username, password, displayName });
        await markActivationCodeUsed(activationCode, cleanAccountText(user.id, 120));
      }
    }

    const publicAccount = toPublicAccount(user);
    if (!publicAccount) {
      return NextResponse.json({ ok: false, error: "账号数据异常。" }, { status: 500 });
    }
    await touchUserLogin(publicAccount.id);
    const session = await createSession(publicAccount.id, request);
    const response = NextResponse.json({ ok: true, account: publicAccount, expiresAt: session.expiresAt });
    const gateCookie = await createAccountGateCookieValue(session.token, ACCOUNT_SESSION_MAX_AGE_SECONDS);
    response.cookies.set(ACCOUNT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACCOUNT_SESSION_MAX_AGE_SECONDS,
    });
    if (gateCookie) {
      response.cookies.set(ACCOUNT_GATE_COOKIE, gateCookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ACCOUNT_SESSION_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: authSetupError(err instanceof Error ? err.message : String(err)) },
      { status: getSupabaseServerConfig() ? 400 : 503 },
    );
  }
}
