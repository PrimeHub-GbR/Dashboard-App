# PROJ-9: Repricer Updater

**Status:** In Progress
**Created:** 2026-03-08

## Summary

N8N-Workflow der eine Repricer-CSV verarbeitet: B-ASINs entfernt, ISBNs in EANs konvertiert, Buchhandelspreise (BBP) abruft und die Preisspalten (price_min, price_max) aktualisiert.

## N8N Workflow

**Name:** [Dashboard] repricer-updater
**Workflow ID:** J7mwDLIzCuiizfTj
**Webhook Path:** /webhook/repricer-updater
**Tag:** claude-generated
**Status:** Active

### Input
POST /webhook/repricer-updater
```json
{
  "job_id": "uuid",
  "workflow_key": "repricer-updater",
  "input_file_path": "userId/timestamp-filename.csv",
  "callback_url": "https://dashboard.primehubgbr.com/api/jobs/{id}/callback"
}
```

### Output (Callback)
POST callback_url
Success:
```json
{
  "status": "success",
  "result_file_path": "workflow-results/repricer_updated_YYYY-MM-DD.csv",
  "metadata": {
    "total": 1240,
    "b_asin_deleted": 15,
    "no_ean": 210,
    "no_price": 35,
    "final": 980
  }
}
```
Error:
```json
{
  "status": "failed",
  "error_message": "CSV-Verarbeitung fehlgeschlagen: ..."
}
```

### CSV Format (10 Spalten)
| Index | Spalte | Beschreibung |
|-------|--------|-------------|
| 0 | sku | SKU |
| 1 | marketplace | Marketplace |
| 2 | merchant_id | Merchant ID |
| 3 | fba | FBA |
| 4 | title | Titel |
| 5 | asin | ASIN/ISBN (B-ASIN-Check + ISBN2EAN) |
| 6 | price_min | Wird mit BBP - 3.00 ueberschrieben |
| 7 | price_max | Wird mit BBP ueberschrieben |
| 8 | repricer_name | Repricer Name |
| 9 | sales_rule | Sales Rule |

### Preisformel
- `price_max = BBP` (kaufmaennisch gerundet, ROUND_HALF_UP)
- `price_min = price_max - 3.00`
- Falls `price_min <= 0`: `price_min = price_max`

### Sub-Workflows Used
- isbn2ean (ID: cmYL3ga4KFiXxsoP, Path: /webhook/isbn2ean)
- ean2bbp (ID: BSPOM3h6KIPRuoqz, Path: /webhook/ean2bbp)

### Node Structure
1. Webhook Trigger (POST /repricer-updater, responseNode)
2. Respond to Webhook (sofort 200 + {"status":"accepted"})
3. Input Validation (Code: prueft job_id, input_file_path, callback_url; baut Supabase-Download-URL)
4. Download CSV (HTTP Request: GET Supabase Storage URL mit Service Key, response as text)
5. Process CSV (Code: B-ASIN-Filter, ISBN2EAN, EAN2BBP, Preisberechnung)
6. Upload Result CSV (HTTP Request: POST to Supabase Storage)
7. Success Callback (HTTP Request: POST to callback_url)
8. Error Callback (Code: faengt Fehler ab, sendet error callback)

### Error Handling
- Nodes 3-6 haben `onError: continueErrorOutput` -> Error Callback
- Error Callback versucht die callback_url aus Input Validation oder Webhook Trigger zu holen
- x-callback-secret Header wird bei allen Callbacks mitgesendet

### Smoke Test
- Happy Path: Execution 99608 (success)
- Error Path: Execution 99610 (success - Fehler korrekt behandelt)
