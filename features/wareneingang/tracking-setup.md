# Wareneingang — Sendungsverfolgung (Tracking-Aggregator) einrichten

Pakete (Amazon, eBay & Co.) werden über die E-Mail-Erkennung erfasst. Für den
**Live-Status + geplanten Liefertag** wird ein Tracking-Aggregator angebunden.
Die Anbindung ist **provider-neutral** gebaut:

```
Aggregator (Ship24 / 17track / …)
   │  Webhook bei Statusänderung
   ▼
N8N-Webhook-Workflow  → normalisiert das Payload
   │  POST mit x-ingest-secret
   ▼
Dashboard  POST /api/wareneingang/tracking
   { tracking_number, status, status_code, carrier, carrier_code, eta_date, eta_text, last_event_at }
   → aktualisiert tracking_status / eta in der wareneingang-Tabelle
```

Zusätzlich registriert der **E-Mail-Workflow** jede neue Sendungsnummer beim
Aggregator (HTTP-Node mit dem API-Key), damit dieser sie überwacht.

## Anbieter-Vergleich (Stand Juni 2026)

| Anbieter | Kostenlos | API + Webhook im Free-Tier | Carrier-Abdeckung |
|---|---|---|---|
| **17track** | 200 Sendungen **einmalig** gratis, danach ab ~9 $/Mon. für 200/Mon. | ✅ | DHL/DPD/Hermes/GLS/UPS/Amazon + global |
| **Ship24** | **10 Sendungen/Monat** dauerhaft gratis | ✅ | sehr breit, global |
| AfterShip | 50 Sendungen/Mon. — aber API/Webhook erst ab ~70 $/Mon. | ❌ | breit |
| TrackingMore | API erst ab ~74 $/Mon. | ❌ | breit |

**Empfehlung:** abhängig vom Volumen — siehe Chat. Da die Anbindung neutral ist,
lässt sich der Anbieter jederzeit wechseln.

## Einrichtungsschritte (sobald Anbieter gewählt)

1. Beim Anbieter registrieren, **API-Key** erzeugen.
2. In N8N eine Umgebungsvariable `TRACKING_API_KEY` hinterlegen (Settings → Variables)
   bzw. Credential anlegen.
3. **Webhook-Workflow** in N8N anlegen: Webhook-Node (öffentliche URL) → Code-Node
   (Payload des Anbieters auf das obige Schema mappen) → HTTP-POST an
   `https://dashboard.primehubgbr.com/api/wareneingang/tracking` mit Header
   `x-ingest-secret` (Wert wie bei /ingest). Diese Webhook-URL beim Anbieter eintragen.
4. Im **E-Mail-Workflow** „[Dashboard] Bestellungen & Pakete (Neuss)" nach dem
   Ingest-POST einen HTTP-Node ergänzen: bei vorhandener `tracking_number` die Sendung
   beim Anbieter registrieren (create tracker), damit der Webhook ausgelöst wird.

Der Dashboard-Endpoint ist bereits live und akzeptiert die normalisierten Updates.
