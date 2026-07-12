// Edge Function: notify-task-completed
//
// Sendet dem ERSTELLER einer Aufgabe (tasks.created_by) eine Push-
// Benachrichtigung (FCM HTTP v1), wenn ein zugewiesener Mitarbeiter die
// Aufgabe erledigt hat (Status -> done). Die Chef-Glocke (taskdone, Mig 093)
// bleibt unveraendert — dieser Push kommt on top.
//
// Aufruf (App + Web, fire-and-forget nach set_my_task_status='done'):
//   POST { task_id: UUID }  mit User-JWT.
//
// Server-seitige Pruefungen (Service-Role):
//   - Aufrufer hat einen verknuepften employee UND ist der Aufgabe zugewiesen
//   - task.status = 'done'
//   - KEIN Push, wenn der Ersteller die Aufgabe selbst erledigt hat
//
// Benötigtes Secret: FCM_SERVICE_ACCOUNT = kompletter Service-Account-JSON.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY kommen von
// Supabase automatisch. Tote Tokens (FCM 404 UNREGISTERED) werden geloescht.

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

    const taskId = body?.task_id as string | undefined;
    if (!taskId) return json({ error: "task_id erforderlich" }, 400);

    // Aufrufer aus dem JWT ermitteln.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const callerUid = userData?.user?.id;
    if (userErr || !callerUid) return json({ error: "Nicht autorisiert" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Aufrufer muss einen verknuepften Mitarbeiter haben.
    const { data: callerEmp } = await admin
      .from("employees")
      .select("id, name")
      .eq("auth_user_id", callerUid)
      .maybeSingle();
    if (!callerEmp) {
      return json({ error: "Kein verknüpfter Mitarbeiter" }, 403);
    }

    // Aufgabe: muss existieren und erledigt sein.
    const { data: task } = await admin
      .from("tasks")
      .select("title, status, created_by")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return json({ error: "Aufgabe nicht gefunden" }, 404);
    if (task.status !== "done") {
      return json({ error: "Aufgabe ist nicht erledigt" }, 400);
    }

    // Aufrufer muss der Aufgabe zugewiesen sein.
    const { data: assignment } = await admin
      .from("task_assignees")
      .select("employee_id")
      .eq("task_id", taskId)
      .eq("employee_id", callerEmp.id)
      .maybeSingle();
    if (!assignment) {
      return json({ error: "Keine Berechtigung für diese Aufgabe" }, 403);
    }

    // Ersteller ermitteln — kein Push, wenn er selbst erledigt hat.
    const creatorUid = task.created_by as string | null;
    if (!creatorUid) return json({ sent: 0, reason: "kein Ersteller" });
    if (creatorUid === callerUid) {
      return json({ sent: 0, reason: "Ersteller hat selbst erledigt" });
    }

    const { data: creatorEmp } = await admin
      .from("employees")
      .select("id")
      .eq("auth_user_id", creatorUid)
      .maybeSingle();
    if (!creatorEmp) {
      return json({ sent: 0, reason: "Ersteller ohne Mitarbeiter-Datensatz" });
    }

    // Geräte-Tokens des Erstellers
    const { data: tokenRows } = await admin
      .from("device_tokens")
      .select("token")
      .eq("employee_id", creatorEmp.id);
    const tokens = (tokenRows ?? []).map((r) => r.token as string);
    if (tokens.length === 0) return json({ sent: 0, reason: "keine Geräte" });

    // FCM-Zugang
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!);
    const accessToken = await getAccessToken(sa);

    const title = (task.title as string) ?? "Aufgabe";
    const completerName = (callerEmp.name as string) ?? "Ein Mitarbeiter";

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
                title: "✅ Aufgabe erledigt",
                body: `${completerName} hat »${title}« erledigt.`,
              },
              data: { task_id: taskId, type: "task_completed" },
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
        // Nur 404 (UNREGISTERED) = Token endgültig tot; 400 nicht löschen.
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
