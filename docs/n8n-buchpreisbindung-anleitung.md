# N8N Anleitung: Buchpreisbindung-Check Workflow

**Was gebaut werden muss:** Ein neuer N8N-Workflow der:
1. Amazon-Schaufenster eines Händlers scrapet (ISBN13 + Preise)
2. VLB API nach BBP-Preisen abfragt (identisch zu EAN2BBP)
3. Preise vergleicht und Verstöße markiert
4. Excel-Datei generiert und in Supabase hochlädt
5. Callback ans Dashboard sendet

---

## Schritt 1 — N8N öffnen

1. Öffne `https://n8n.primehubgbr.com` im Browser
2. Melde dich an
3. Klicke links auf **"Workflows"**
4. Klicke oben rechts auf **"+ New workflow"**
5. Benenne den Workflow oben links: **`Buchpreisbindung-Check`**

---

## Schritt 2 — Webhook-Node anlegen

1. Klicke auf **"+"** im Canvas und suche nach **"Webhook"**
2. Konfiguriere den Node:
   - **HTTP Method:** `POST`
   - **Path:** `buchpreisbindung-check`
3. Den Node nennen: **`Webhook`**

---

## Schritt 3 — Respond to Webhook (sofort antworten)

1. Verbinde einen **"Respond to Webhook"**-Node nach dem Webhook-Node
2. Konfiguriere:
   - **Respond With:** `JSON`
   - **Response Body:** `{ "received": true }`
3. Den Node nennen: **`Respond to Webhook`**

> ⚠️ Wichtig: Der Webhook muss sofort antworten, damit das Dashboard nicht wartet. Die weitere Verarbeitung läuft danach asynchron weiter.

---

## Schritt 4 — Amazon Seite 1 scrapen

1. Füge einen **"HTTP Request"**-Node hinzu
2. Verbinde ihn nach **"Respond to Webhook"**
3. Konfiguriere:
   - **Method:** `GET`
   - **URL:**
     ```
     https://www.amazon.de/s?me={{ $('Webhook').first().json.body.seller_id }}&i=stripbooks&page=1
     ```
   - **Response Format:** `Text`
4. Klicke auf **"Add Option" → "Headers"** und füge hinzu:
   | Name | Value |
   |------|-------|
   | `User-Agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36` |
   | `Accept-Language` | `de-DE,de;q=0.9` |
   | `Accept` | `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` |
5. Den Node nennen: **`Amazon Seite 1`**

---

## Schritt 5 — HTML parsen + ASIN/Preis extrahieren

1. Füge einen **"Code"**-Node hinzu, verbinde nach `Amazon Seite 1`
2. Füge diesen JavaScript-Code ein:

```javascript
// Parst Amazon Search Result HTML
// Extrahiert ASIN, Titel, Preis, URL
// Konvertiert numerische ASIN → ISBN13

function isbn10ToIsbn13(isbn10) {
  const clean = isbn10.replace(/[^0-9X]/gi, '').substring(0, 9);
  const withPrefix = '978' + clean;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(withPrefix[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return withPrefix + check;
}

const html = $input.first().json.data ?? $input.first().json;
const htmlStr = typeof html === 'string' ? html : JSON.stringify(html);

const products = [];

// Extrahiere Produkt-Blöcke (data-asin Attribute)
const asinRegex = /data-asin="([A-Z0-9]{10})"[^>]*>/g;
const titleRegex = /class="[^"]*s-title-instructions[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]{2,200})<\/span>/;
const priceRegex = /class="[^"]*a-price[^"]*"[\s\S]*?<span[^>]*>(\d+[,\.]\d{2})/;

// Alternative simpler extraction - find all data-asin values with nearby title/price
const blockRegex = /data-asin="([A-Z0-9]{10})"([\s\S]*?)(?=data-asin="|<\/div>\s*<div[^>]*class="[^"]*s-result-item)/g;
let match;

while ((match = blockRegex.exec(htmlStr)) !== null) {
  const asin = match[1];
  const block = match[2];
  
  // Only process numeric ASINs (these are ISBN10 for physical books)
  if (!/^\d{9}[\dX]$/.test(asin) && !/^\d{10}$/.test(asin)) {
    // Try anyway — some book ASINs start with B but still have ISBN in the page
    // Skip non-book ASINs
    continue;
  }
  
  const isbn13 = isbn10ToIsbn13(asin);
  
  // Extract title
  const titleMatch = block.match(/aria-label="([^"]{3,200})"/) 
    ?? block.match(/<span[^>]*class="[^"]*a-size-medium[^"]*"[^>]*>([^<]{3,200})<\/span>/);
  const title = titleMatch ? titleMatch[1].trim() : null;
  
  // Extract price (German format: 12,99)
  const priceMatch = block.match(/(\d{1,3}[,\.]\d{2})\s*€/)
    ?? block.match(/€\s*(\d{1,3}[,\.]\d{2})/)
    ?? block.match(/"displayAmount":"EUR (\d{1,3}[,\.]\d{2})"/);
  let amazonPrice = null;
  if (priceMatch) {
    amazonPrice = parseFloat(priceMatch[1].replace(',', '.'));
  }
  
  const amazonUrl = `https://www.amazon.de/dp/${asin}`;
  
  if (isbn13 && amazonPrice != null) {
    products.push({
      json: {
        asin,
        isbn13,
        title,
        amazon_price: amazonPrice,
        amazon_url: amazonUrl,
      }
    });
  }
}

// Deduplizieren nach ISBN13
const seen = new Set();
const unique = products.filter(p => {
  if (seen.has(p.json.isbn13)) return false;
  seen.add(p.json.isbn13);
  return true;
});

return unique.length > 0 ? unique : [{ json: { _noProducts: true } }];
```

3. Den Node nennen: **`Parse Amazon HTML`**

---

## Schritt 6 — Prüfen ob Produkte gefunden wurden

1. Füge einen **"If"**-Node hinzu
2. Konfiguriere:
   - **Condition:** `{{ $json._noProducts }}` **is not** `true`
3. Den Node nennen: **`Hat Produkte?`**
4. Den **TRUE-Ausgang** weiter verbinden (zum VLB-Login)
5. Den **FALSE-Ausgang** zum Fehler-Callback verbinden (Schritt 13)

---

## Schritt 7 — VLB Login

> Identisch zum bestehenden EAN2BBP-Workflow!

1. Füge einen **"HTTP Request"**-Node hinzu nach `Hat Produkte? → TRUE`
2. Konfiguriere:
   - **Method:** `POST`
   - **URL:** `https://api.vlb.de/api/v2/login`
   - **Body Type:** `JSON`
   - **Body:**
     ```json
     {
       "username": "6242208",
       "password": "Semosemo2022"
     }
     ```
3. Den Node nennen: **`VLB-Login`**

---

## Schritt 8 — Merge (Amazon-Daten + VLB-Token zusammenführen)

1. Füge einen **"Merge"**-Node hinzu
2. **Mode:** `Choose Branch` (Eingang 0 = Amazon-Daten, Eingang 1 = VLB-Login)
3. Verbinde:
   - `Parse Amazon HTML` → Eingang 0 des Merge-Nodes
   - `VLB-Login` → Eingang 1 des Merge-Nodes
4. Den Node nennen: **`Merge`**

---

## Schritt 9 — Split in Batches

1. Füge einen **"Split In Batches"**-Node hinzu nach `Merge`
2. **Batch Size:** `150`
3. Den Node nennen: **`Loop Over Items`**

---

## Schritt 10 — Batch-Payload für VLB aufbauen

> Identisch zum bestehenden EAN2BBP-Workflow!

1. Füge einen **"Code"**-Node hinzu (Ausgang "Loop Over Items" → Batch)
2. Code:

```javascript
const content = [];

for (const item of items) {
  const isbn = String(item.json.isbn13 ?? '').replace(/[-\s]/g, '').trim();
  if (/^\d{13}$/.test(isbn)) {
    content.push({ isbn });
  }
}

return [{ json: { content } }];
```

3. Den Node nennen: **`Build Batch Payload`**

---

## Schritt 11 — VLB Produktdetails abfragen

> Identisch zum bestehenden EAN2BBP-Workflow!

1. Füge einen **"HTTP Request"**-Node hinzu
2. Konfiguriere:
   - **Method:** `POST`
   - **URL:** `https://api.vlb.de/api/v2/products?page=1&size=250`
   - **Headers:**
     | Name | Value |
     |------|-------|
     | `Authorization` | `Bearer {{ $node["VLB-Login"].json.data }}` |
     | `Accept` | `application/json-short` |
   - **Body:** `{{ $json }}`
   - **Retry On Fail:** ✅ ein, **Max Tries:** 3, **Wait:** 5000ms
   - **On Error:** `Continue (regular output)`
3. Den Node nennen: **`VLB Produktdetails`**
4. Verbinde den Ausgang zurück zu `Loop Over Items` (Loop-Eingang)

---

## Schritt 12 — Preis-Vergleich durchführen

1. Wenn der Loop fertig ist, füge einen **"Code"**-Node an den Done-Ausgang des Loop
2. Code:

```javascript
// Merged Amazon-Daten mit VLB BBP-Preisen
// Gibt Items zurück für Excel + Callback

function normEAN(v) {
  return String(v ?? '').replace(/[^0-9X]/gi, '');
}

function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getTypeCode(p) {
  const raw = p?.priceTypeDE ?? p?.priceTypeDe ?? p?.priceTypede ?? p?.priceType ?? p?.priceTypeD;
  return String(raw ?? '').trim().padStart(2, '0');
}

// 1. Alle VLB-Produktdaten sammeln
const vlbProducts = new Map();
for (const item of items) {
  const content = item.json?.content;
  if (Array.isArray(content)) {
    for (const p of content) {
      const ean = normEAN(p.gtin || p.isbn || p.identifier);
      const preis = parsePrice(p.priceEurD);
      const type = getTypeCode(p);
      
      let isBBP = false;
      if (['04', '24'].includes(type) || (p.priceFixedEurD === true && p.priceProvisionalEurD === false)) {
        isBBP = true;
      }
      
      if (ean && preis != null && isBBP) {
        vlbProducts.set(ean, {
          vlb_price: preis,
          title_vlb: p.title || p.shortTitle || null,
        });
      }
    }
  }
}

// 2. Amazon-Daten aus dem ursprünglichen Input holen
// (über Webhook-Node, da die Amazon-Daten durch den Loop-Merge nicht direkt verfügbar sind)
const webhookNode = $('Webhook').first().json;
const sellerAmazonId = webhookNode.body?.seller_id ?? '';

// 3. Alle Items aus dem Loop-Eingang verarbeiten
// Wir müssen alle Batche-Eingaben re-assembeln — holen aus dem Merge-Node
const amazonItems = $('Parse Amazon HTML').all();

const results = [];
let violations = 0;

const now = new Date().toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

for (const amazonItem of amazonItems) {
  const { isbn13, asin, title, amazon_price, amazon_url } = amazonItem.json;
  if (!isbn13 || amazon_price == null) continue;
  
  const vlbData = vlbProducts.get(isbn13);
  const vlb_price = vlbData?.vlb_price ?? null;
  const is_compliant = vlb_price != null ? amazon_price <= vlb_price : null;
  
  if (is_compliant === false) violations++;
  
  results.push({
    json: {
      // Für Excel-Ausgabe
      'Datum/Uhrzeit': now,
      'Händler': sellerAmazonId,
      'Buchtitel': title ?? vlbData?.title_vlb ?? '—',
      'Preis Verkäufer (€)': amazon_price,
      'Preis VLB/BBP (€)': vlb_price ?? '—',
      'ISBN13': isbn13,
      'ASIN': asin ?? '—',
      'Amazon-Link': amazon_url ?? `https://www.amazon.de/dp/${asin}`,
      'Status': is_compliant === true ? '✅ OK' : is_compliant === false ? '❌ VERSTOSS' : '⚪ Kein VLB-Preis',
      // Für Callback-Payload
      _isbn13: isbn13,
      _asin: asin,
      _title: title ?? vlbData?.title_vlb ?? null,
      _amazon_price: amazon_price,
      _vlb_price: vlb_price,
      _amazon_url: amazon_url,
      _is_compliant: is_compliant,
    }
  });
}

// Globale Zähler speichern
globalThis._buchpreisResults = results;
globalThis._totalItems = results.length;
globalThis._violations = violations;

return results;
```

3. Den Node nennen: **`Preisvergleich`**

---

## Schritt 13 — Excel-Datei erstellen

1. Füge einen **"Convert to File"**-Node hinzu
2. Konfiguriere:
   - **Operation:** `xlsx`
   - **Input Data Field Name:** `data` (Standard)
3. Den Node nennen: **`Convert to File`**

---

## Schritt 14 — Excel in Supabase hochladen

1. Füge einen **"HTTP Request"**-Node hinzu
2. Konfiguriere:
   - **Method:** `POST`
   - **URL:**
     ```
     https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/workflow-results/buchpreischeck/{{ $('Webhook').first().json.body.seller_id }}/{{ $('Webhook').first().json.body.run_id }}.xlsx
     ```
   - **Authentication:** Generic Credential Type → **Supabase account** (Service Role Key)
   - **Send Headers:** ✅ ein
     | Name | Value |
     |------|-------|
     | `x-upsert` | `true` |
   - **Body:** Binary Data
   - **Input Data Field Name:** (Feldname aus Convert-to-File, z.B. `data`)
3. Den Node nennen: **`Upload Result`**

---

## Schritt 15 — Callback Success vorbereiten

1. Füge einen **"Code"**-Node hinzu
2. Code:

```javascript
const webhookBody = $('Webhook').first().json.body;
const callbackUrl = webhookBody.callback_url;
const runId = webhookBody.run_id;
const sellerId = webhookBody.seller_id;

const allResults = $('Preisvergleich').all();
const totalItems = allResults.length;
let violations = 0;

const items = allResults.map(r => {
  const d = r.json;
  if (d._is_compliant === false) violations++;
  return {
    isbn13: d._isbn13,
    asin: d._asin,
    title: d._title,
    amazon_price: d._amazon_price,
    vlb_price: d._vlb_price,
    amazon_url: d._amazon_url,
    is_compliant: d._is_compliant,
  };
});

return [{
  json: {
    callback_url: callbackUrl,
    body: JSON.stringify({
      status: 'success',
      result_file_path: `buchpreischeck/${sellerId}/${runId}.xlsx`,
      metadata: {
        total_items: totalItems,
        violations_count: violations,
        items,
      }
    })
  }
}];
```

3. Den Node nennen: **`Sign Callback Success`**

---

## Schritt 16 — Callback an Dashboard senden

1. Füge einen **"HTTP Request"**-Node hinzu
2. Konfiguriere:
   - **Method:** `POST`
   - **URL:** `{{ $json.callback_url }}`
   - **Content Type:** `Raw`
   - **Raw Content Type:** `application/json`
   - **Body:** `{{ $json.body }}`
3. Den Node nennen: **`Callback Success`**

---

## Schritt 17 — VLB Logout

1. Füge einen **"HTTP Request"**-Node hinzu
2. Konfiguriere:
   - **URL:** `https://api.vlb.de/api/v2/logout?access_token={{ $node["VLB-Login"].json.data }}`
3. Den Node nennen: **`VLB-Logout`**

---

## Schritt 18 — Fehler-Callback (für keine Produkte)

1. Füge einen **"Code"**-Node hinzu am FALSE-Ausgang von `Hat Produkte?`
2. Code:

```javascript
const webhookBody = $('Webhook').first().json.body;
return [{
  json: {
    callback_url: webhookBody.callback_url,
    body: JSON.stringify({
      status: 'failed',
      error_message: 'Keine Bücher auf dem Amazon-Schaufenster gefunden. Prüfe ob die Seller-ID korrekt ist oder ob Amazon die Anfrage blockiert hat.',
    })
  }
}];
```

3. Füge einen **"HTTP Request"**-Node hinzu
4. Verbinde `Sign Callback Fehler` → HTTP Request mit:
   - **URL:** `{{ $json.callback_url }}`
   - **Body:** `{{ $json.body }}`
5. Den Node nennen: **`Callback Fehler`**

---

## Schritt 19 — Workflow speichern und aktivieren

1. Klicke oben rechts auf den roten **"Save"**-Button
2. Klicke dann auf den **Toggle** oben rechts (grau → grün = aktiv)
3. Der Workflow ist jetzt bereit — das Dashboard kann ihn via `/buchpreisbindung-check` triggern

---

## Schritt 20 — Erster Test

1. Gehe ins Dashboard: `https://dashboard.primehubgbr.com/dashboard/buchpreisbindung`
2. Füge einen Händler hinzu (z.B. eine bekannte Seller-ID)
3. Klicke auf **"▶ Jetzt prüfen"**
4. Wechsle zurück zu N8N → Klicke auf **"Executions"** (oben links)
5. Du siehst den laufenden Execution — bei Fehlern ist der fehlerhafte Node rot markiert

---

## Wichtige Hinweise

### Amazon-Blocking
- Amazon kann den direkten HTTP-Request manchmal blockieren (HTTP 503 / CAPTCHA)
- Falls das passiert: **keine Panik** — das Dashboard zeigt dann "Fehler" beim Run
- Lösung: Intervall auf 6h oder 24h setzen (reduziert Blocking-Risiko erheblich)
- Langfristige Alternative: ScraperAPI einbauen (URL: `http://api.scraperapi.com/?api_key=KEY&url=...`)

### VLB-Login Token
- Der Token vom VLB-Login ist ~60 Minuten gültig
- Der Workflow führt Login + Logout in jedem Run durch — das ist korrekt

### Callback-Payload Größe
- Bei sehr vielen Büchern (>500) kann der `items[]`-Array im Callback groß werden
- N8N hat kein Problem damit, das Dashboard-Backend verarbeitet es in 500er-Batches

### Erste Seite vs. alle Seiten
- Der aktuelle Workflow lädt nur Seite 1 (ca. 24-48 Bücher)
- Für vollständige Prüfung: Schritt 5 erweitern mit Loop über `&page=2`, `&page=3` etc.
- Abbruchbedingung: Wenn keine `data-asin` Attribute mehr in der Antwort sind
