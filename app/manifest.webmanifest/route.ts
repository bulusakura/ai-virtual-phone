import { NextRequest, NextResponse } from "next/server";

import baseManifest from "../../public/manifest.json";
import { readPwaDisplayPreference } from "@/lib/pwa-display-mode";

export const runtime = "nodejs";

// Edge's installed PWA renders the top status-bar area as a solid (black) band in
// `standalone` mode instead of showing the native status bar. Serving `minimal-ui`
// + a light theme_color brings the native status bar (clock/battery/signal) back —
// but ONLY for Edge, so Chrome/others keep the fully immersive `standalone` look.
// The manifest is fetched per browser at install time, so UA sniffing here works.
// Takes effect only on (re)install.
//
// An explicit cookie can override the install mode. With no cookie, keep the
// upstream behavior so existing installs and users are not silently changed.
export function GET(request: NextRequest) {
  const ua = request.headers.get("user-agent") || "";
  const isEdge = /Edg/i.test(ua);
  const preference = readPwaDisplayPreference(request.headers.get("cookie") || "");

  const manifest = preference === "fullscreen"
    ? {
        ...baseManifest,
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
      }
    : preference === "standalone"
      ? {
          ...baseManifest,
          display: isEdge ? "minimal-ui" : "standalone",
          display_override: isEdge ? ["minimal-ui", "standalone"] : ["standalone", "minimal-ui"],
          ...(isEdge ? { theme_color: "#f8f7f2" } : {}),
        }
      : isEdge
        ? {
            ...baseManifest,
            display: "minimal-ui",
            display_override: ["minimal-ui", "standalone"],
            theme_color: "#f8f7f2",
          }
        : baseManifest;

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "vary": "user-agent, cookie",
      "cache-control": "no-store",
    },
  });
}
