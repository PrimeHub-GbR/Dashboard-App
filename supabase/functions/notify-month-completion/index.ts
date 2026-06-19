// Edge Function: notify-month-completion
//
// Sendet eine Push-Benachrichtigung (Firebase Cloud Messaging, HTTP v1) an die
// Geräte eines Mitarbeiters, wenn dieser sein Monats-Soll erstmalig erreicht hat.
// Wird intern vom Kiosk-Checkout (Dashboard-API) mit Service-Role-Bearer
// aufgerufen — kein User-JWT, daher verify_jwt = false; eigene Service-Role-Gate.
//
// Aufruf: POST { employee_id: UUID, title?: string, body?: string }
//
// Benötigtes Secret: FCM_SERVICE_ACCOUNT = kompletter Service-Account-JSON.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY werden von Supabase bereitgestellt.

import { createClient } from "jsr:@supabase/supabase-js@2";

const FCM_PROJECT_ID = "primehub-fc64f";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- JWT/OAuth2 für FCM ---------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (o: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(sigBuf))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`OAuth fehlgeschlagen: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

// --- Handler --------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => null);

    // Health-Check (kein Versand).
    if (body?.smoke === true) {
      try {
        const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!);
        const at = await getAccessToken(sa);
        return json({
          smoke: true,
          ok: true,
          project: sa.project_id,
          tokenPrefix: at.slice(0, 12),
        });
      } catch (e) {
        return json({ smoke: true, ok: false, error: String(e) }, 500);
      }
    }

    // Service-Role-Gate: ausschließlich interner Aufruf (Kiosk-Checkout).
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Nicht autorisiert" }, 401);
    }

    const employeeId = body?.employee_id as string | undefined;
    if (!employeeId) {
      return json({ error: "employee_id erforderlich" }, 400);
    }
    const title = (body?.title as string) ?? "🎉 Stunden erreicht";
    const msgBody = (body?.body as string) ??
      "Du hast deine Stunden für diesen Monat erreicht. Stark!";

    const admin = createClient(supabaseUrl, serviceKey);

    // Geräte-Tokens des Mitarbeiters
    const { data: tokenRows } = await admin
      .from("device_tokens")
      .select("token")
      .eq("employee_id", employeeId);
    const tokens = (tokenRows ?? []).map((r) => r.token as string);
    if (tokens.length === 0) return json({ sent: 0, reason: "keine Geräte" });

    // FCM-Zugang
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!);
    const accessToken = await getAccessToken(sa);

    let sent = 0;
    const stale: string[] = [];
    for (const token of tokens) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body: msgBody },
              data: { type: "month_completion" },
              android: { priority: "high" },
              apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default" } },
              },
            },
          }),
        },
      );
      if (res.ok) {
        sent++;
      } else {
        if (res.status === 404) stale.push(token);
      }
    }

    if (stale.length > 0) {
      await admin.from("device_tokens").delete().in("token", stale);
    }

    return json({ sent, total: tokens.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
