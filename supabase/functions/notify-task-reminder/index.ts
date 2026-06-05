// Edge Function: notify-task-reminder
//
// Sendet eine Erinnerungs-Push (Firebase Cloud Messaging, HTTP v1) an die
// Geräte ALLER aktuell zugewiesenen Personen einer Aufgabe. Wird vom Chef per
// "Erinnern"-Button ausgelöst. Erscheint auch außerhalb der App in der
// Benachrichtigungszeile (FCM notification-Payload).
//
// Aufruf (nur Chef): POST { task_id: UUID }
// Auth: User-JWT erforderlich; is_chef() wird geprüft (Rolle ODER Position).
// Es gibt KEINE Hierarchie-Einschränkung beim Ziel — der Chef kann auch andere
// Chefs und Manager erinnern (jeder, der der Aufgabe zugewiesen ist).
//
// Benötigtes Secret: FCM_SERVICE_ACCOUNT = kompletter Service-Account-JSON.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY kommen von
// Supabase automatisch.

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
    const body = await req.json().catch(() => null);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Nicht autorisiert" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Interner Aufruf (Service-Role-Key) überspringt den Rollencheck.
    const isInternal = authHeader === `Bearer ${serviceKey}`;
    if (!isInternal) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: isChef, error: roleErr } = await userClient.rpc("is_chef");
      if (roleErr) return json({ error: "Rollenprüfung fehlgeschlagen" }, 500);
      if (!isChef) return json({ error: "Nur Chef darf erinnern" }, 403);
    }

    const taskId = body?.task_id as string | undefined;
    if (!taskId) return json({ error: "task_id erforderlich" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Aufgaben-Titel
    const { data: task } = await admin
      .from("tasks")
      .select("title")
      .eq("id", taskId)
      .single();
    if (!task) return json({ error: "Aufgabe nicht gefunden" }, 404);
    const title = (task.title as string) ?? "Aufgabe";

    // Aktuell zugewiesene Personen (alle — auch Chefs/Manager)
    const { data: assignRows } = await admin
      .from("task_assignees")
      .select("employee_id")
      .eq("task_id", taskId);
    const assigneeIds = (assignRows ?? []).map((r) => r.employee_id as string);
    if (assigneeIds.length === 0) {
      return json({ sent: 0, reason: "niemand zugewiesen" });
    }

    // Geräte-Tokens
    const { data: tokenRows } = await admin
      .from("device_tokens")
      .select("token")
      .in("employee_id", assigneeIds);
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
              notification: {
                title: "⏰ Erinnerung",
                body: `Bitte denk an: ${title}`,
              },
              data: { task_id: taskId, type: "reminder" },
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
        if (res.status === 404 || res.status === 400) stale.push(token);
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
