# N8N ↔ Dashboard Integration — Leitplanken

Bewährte Patterns und häufige Fehler beim Verbinden von N8N-Workflows mit dem Dashboard-Jobsystem.

---

## Workflow-Struktur (Dashboard-Branch)

Jeder Dashboard-kompatible N8N-Workflow folgt diesem Schema:

```
Webhook (POST /{workflow_key})
    ↓
Respond to Webhook  ← sofort antworten (202), damit Dashboard nicht wartet
    ↓
Download File       ← Eingabedatei aus Supabase Storage laden
    ↓
Switch              ← Dateityp erkennen (.xlsx / .xls / .csv)
    ↓
Extract from xls / Extract from csv
    ↓
[Kern-Logik-Nodes]
    ↓
Convert to File     ← Ergebnis zurück in Binärdatei
    ↓
Upload Result       ← Ergebnisdatei in Supabase Storage hochladen
    ↓
[Sign Callback]     ← job_id + callback_url aus Webhook-Node holen
    ↓
Callback Success    ← POST an callback_url mit { status, result_file_path }
```

---

## Webhook-Body

Das Dashboard sendet immer diesen Body:
```json
{
  "job_id": "<UUID>",
  "workflow_key": "<key>",
  "input_file_path": "<user_id>/<timestamp>-<filename>",
  "callback_url": "https://dashboard.primehubgbr.com/api/jobs/<UUID>/callback"
}
```

Zugriff in N8N-Expressions: `$('WebhookNodeName').first().json.body.job_id`

---

## Häufige Fehler & Fixes

### 1. Download File — "Bad request - InvalidKey"

**Ursache:** Supabase-Credential verwendet den **Anon Key** statt den **Service Role Key**. Private Buckets (`workflow-uploads`, `workflow-results`) erfordern den Service Role Key.

**Fix:**
- Authentication → Generic Credential Type → Header Auth
- Header Auth Credential: `Authorization: Bearer <service_role_key>`
- Oder N8N-Umgebungsvariable: `Authorization: Bearer {{ $env.SUPABASE_SERVICE_KEY }}`

---

### 2. Switch — Dateityp-Erkennung schlägt fehl

**Ursache:** Expression referenziert `$json.data.EAN_List.filename` — falsch für Binärdaten.

**Fix:** Binary-Felder werden über `$binary` angesprochen, nicht `$json`:
```
{{ $binary.EAN_List.fileName }}
```
*(Achtung: `fileName` mit großem N)*

Korrekte Switch-Regeln:
| Expression | Operator | Wert |
|-----------|----------|------|
| `{{ $binary.FELDNAME.fileName }}` | ends with | `.xlsx` |
| `{{ $binary.FELDNAME.fileName }}` | ends with | `.xls` |
| `{{ $binary.FELDNAME.fileName }}` | ends with | `.csv` |

---

### 3. Upload Result — job_id fehlt in URL / "Duplicate"

**Ursache 1:** `$json.job_id` ist undefined, weil der aktuelle Item die Binärdatei ist (kein job_id-Feld). Die URL wird zu `workflow-results/.xlsx`.

**Fix URL:**
```
https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/workflow-results/{{ $('WebhookNodeName').first().json.body.job_id }}.xlsx
```

**Ursache 2:** Supabase wirft "Duplicate" wenn der Pfad bereits existiert (z.B. bei Retry).

**Fix:** Header `x-upsert: true` hinzufügen → Send Headers aktivieren:
| Name | Value |
|------|-------|
| `x-upsert` | `true` |

---

### 4. Code-Node — "Referenced node doesn't exist"

**Ursache:** `$('Webhook1')` findet keinen Node mit diesem Namen — Node wurde anders benannt.

**Fix:** Genauen Node-Namen im Canvas prüfen (Klick auf den Node → Name oben im Panel ablesen) und im Code anpassen:
```javascript
const jobId = $('EXAKTER_NODE_NAME').first().json.body.job_id
const callbackUrl = $('EXAKTER_NODE_NAME').first().json.body.callback_url
```

---

### 5. Upload Result — "The item has no binary field 'XYZ'"

**Ursache:** "Input Data Field Name" in der Upload-Node stimmt nicht mit dem Feldnamen überein, den die vorherige Node ausgegeben hat.

**Fix:** Feldnamen aus dem INPUT-Panel (Binary-Tab) ablesen und in "Input Data Field Name" eintragen. Beispiel: wenn der Convert-to-File-Node `ISBN2EAN` ausgibt → Feld auf `ISBN2EAN` setzen.

---

### 6. Doppelte Switch-Regeln

**Ursache:** Beim Kopieren von Nodes entstehen versehentlich doppelte Routing-Regeln (z.B. zweimal `.xlsx`).

**Regel:** Pro Dateityp genau eine Regel. Standard: `.xlsx`, `.xls`, `.csv`, Fehler-Branch.

---

## Supabase Storage — URLs

| Bucket | Zweck | Pfad-Schema |
|--------|-------|-------------|
| `workflow-uploads` | Eingabedateien | `<user_id>/<timestamp>-<filename>` |
| `workflow-results` | Ergebnisdateien | `<job_id>.xlsx` |

Download-URL: `https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/workflow-uploads/{{ $json.body.input_file_path }}`

Upload-URL: `https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/workflow-results/{{ $('WebhookNodeName').first().json.body.job_id }}.xlsx`

---

## Callback an Dashboard

```json
POST {{ callbackUrl }}
Content-Type: application/json

{
  "status": "success",
  "result_file_path": "<job_id>.xlsx"
}
```

Bei Fehler:
```json
{
  "status": "failed",
  "error_message": "Beschreibung des Fehlers"
}
```

HMAC-Signierung ist **optional** — wenn `N8N_HMAC_SECRET` nicht gesetzt ist, akzeptiert das Dashboard den Callback ohne Signatur.
