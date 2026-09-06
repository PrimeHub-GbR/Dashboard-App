// Market-Listings in PlentyONE stapelweise prüfen lassen.
//
// Warum: Die Gruppenfunktion in der Oberfläche verarbeitet höchstens acht
// Listings. Bei mehr meldet sie sofort Erfolg und tut nichts — erkennbar
// daran, dass die Spalte "Einstellgebühr" leer bleibt. Der Server nimmt zwar
// beliebig lange Listen an, arbeitet aber nur kleine Mengen wirklich ab.
// Deshalb hier: vier IDs je Aufruf, Pause dazwischen. Details in
// docs/ebay-kette-technik.md §12b.
//
// So wird es benutzt:
//   1. In PlentyONE angemeldet bleiben, Market-Listings öffnen
//   2. F12 → Konsole → einmal "allow pasting" eintippen und bestätigen
//   3. VON und BIS unten auf den MLID-Bereich setzen (Spalte MLID,
//      kleinster und größter Wert)
//   4. Diese Datei komplett einfügen, Enter
//   5. Tab offen lassen, bis "fertig" erscheint (~400 Listings pro Stunde)
//
// Es wird nur geprüft, nichts gelistet: ItemListingGroupActionRunValidation
// ist eBays VerifyAddItem, also ein Trockenlauf ohne Gebühren.

const VON = 64, BIS = 109;      // <-- anpassen
const STAPEL = 4;               // mehr als acht verarbeitet der Server nicht
const PAUSE = 30000;            // ms; bei Ausrufezeichen erhöhen

const alle = [];
for (let i = VON; i <= BIS; i++) alle.push(i);

for (let k = 0; k < alle.length; k += STAPEL) {
  const ids = alle.slice(k, k + STAPEL);
  const payload = { requests: [{
    _dataName: 'ItemListingGroupAction',
    _moduleName: 'item/listing/group_action',
    _searchParams: {}, _validateParams: {}, _dataArray: {},
    _writeParams: { marketListingId: ids.join(',') },
    _commandStack: [{ type: 'write', command: 'write' }],
    _dataList: { ItemListingGroupActionRunValidation: {
      _dataName: 'ItemListingGroupActionRunValidation',
      _moduleName: 'item/listing/group_action',
      _writeParams: {}, _searchParams: {}, _dataArray: {}, _dataList: {} } },
  // meta.token ist eine mitgeschnittene Sitzungs-Nonce der Oberflaeche,
  // kein Zugangsschluessel - ohne den Sitzungs-Cookie nuetzt sie niemandem.
  // Sollte der Aufruf eines Tages abgelehnt werden: neuen Wert aus einem
  // F12-Mitschnitt der Gruppenfunktion eintragen.
  }], meta: { id: 5, token: 'ar4Irci8NJqMkOhs' } };

  // Kein Authorization-Header nötig: der Sitzungs-Cookie reicht, und
  // credentials:'include' schickt ihn mit (er ist HttpOnly, also aus
  // JavaScript nicht lesbar).
  const r = await fetch('/plenty/api/ui.php', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: 'request=' + encodeURIComponent(JSON.stringify(payload)),
  });
  console.log(new Date().toLocaleTimeString(), ids.join(','), r.status);
  await new Promise((s) => setTimeout(s, PAUSE));
}
console.log('fertig');
