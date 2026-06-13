// Edge Function: notify-scheduled
//
// Zeitgesteuerte Pushes, ausgeloest per pg_cron (pg_net). Authentifizierung
// ueber den Service-Role-Key (Bearer). Zwei Modi:
//   { "mode": "no_shows" }     -> Chef-Push: gestern verplant, nicht erschienen
//   { "mode": "planning_due" } -> Mitarbeiter-Push: naechster Monat unverplant
//
// FCM v1 via Service-Account (geteilt mit notify-employee-event).

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Nur intern: Service-Role-Bearer (vom Cron-Job mitgeschickt).
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Nicht autorisiert" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode as string | undefined;
    const admin = createClient(supabaseUrl, serviceKey);
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!);

    // Sammelt (employee_id -> {title, body}) und verschickt am Ende gebuendelt.
    const targets: { employeeId: string; title: string; body: string }[] = [];

    if (mode === "no_shows") {
      // persistiert die Events (fuer das MA-Pop-up) UND gibt sie zurueck.
      const { data: rows } = await admin.rpc("record_yesterday_no_shows");
      const list = (rows ?? []) as Array<
        { employee_name: string; planned_from: string; planned_to: string }
      >;
      if (list.length === 0) return json({ sent: 0, reason: "keine No-Shows" });
      const names = list
        .map((r) =>
          r.planned_from && r.planned_to
            ? `${r.employee_name} (${r.planned_from}–${r.planned_to})`
            : r.employee_name
        )
        .join(", ");
      const title = list.length === 1
        ? "Mitarbeiter nicht erschienen"
        : `${list.length} Mitarbeiter nicht erschienen`;
      const text = `Gestern verplant, aber nicht eingestempelt: ${names}.`;
      const { data: chefs } = await admin.rpc("chef_employee_ids");
      for (const c of (chefs ?? []) as Array<{ id: string }>) {
        targets.push({ employeeId: c.id, title, body: text });
      }
    } else if (mode === "planning_due") {
      const { data: rows } = await admin.rpc("get_planning_due_internal");
      const list = (rows ?? []) as Array<
        { employee_id: string; target_hours: number; planned_hours: number }
      >;
      if (list.length === 0) return json({ sent: 0, reason: "alle verplant" });
      for (const r of list) {
        const missing = Math.max(0, Math.round(r.target_hours - r.planned_hours));
        targets.push({
          employeeId: r.employee_id,
          title: "Arbeitsplanung fällig",
          body:
            `Bitte plane den nächsten Monat — es fehlen noch ${missing} h. ` +
            `Solange dein Plan unvollständig ist, erinnert dich die App bei jedem Start.`,
        });
      }
    } else if (mode === "overdue_tasks") {
      // setzt Prio 'high' (Seiteneffekt) + liefert Eskalations-Empfaenger.
      const { data: rows } = await admin.rpc("escalate_overdue_tasks");
      const list = (rows ?? []) as Array<
        { recipient_id: string; title: string; body: string }
      >;
      if (list.length === 0) return json({ sent: 0, reason: "keine Eskalation" });
      for (const r of list) {
        targets.push({ employeeId: r.recipient_id, title: r.title, body: r.body });
      }
    } else {
      return json({ error: "unbekannter mode" }, 400);
    }

    if (targets.length === 0) return json({ sent: 0 });

    const accessToken = await getAccessToken(sa);
    let sent = 0;
    const stale: string[] = [];
    for (const t of targets) {
      const { data: tokenRows } = await admin
        .from("device_tokens")
        .select("token")
        .eq("employee_id", t.employeeId);
      for (const row of (tokenRows ?? []) as Array<{ token: string }>) {
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
                token: row.token,
                notification: { title: t.title, body: t.body },
                data: { type: "scheduled", mode: mode ?? "" },
                android: { priority: "high" },
                apns: {
                  headers: { "apns-priority": "10" },
                  payload: { aps: { sound: "default" } },
                },
              },
            }),
          },
        );
        if (res.ok) sent++;
        else if (res.status === 404) stale.push(row.token);
      }
    }
    if (stale.length > 0) {
      await admin.from("device_tokens").delete().in("token", stale);
    }
    return json({ mode, targets: targets.length, sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
