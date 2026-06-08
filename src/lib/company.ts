// Zentrale Firmenstammdaten — von Landing Page & Impressum gemeinsam genutzt.
export const COMPANY = {
  name: 'PrimeHub GbR',
  shortName: 'PrimeHub',
  street: 'Wilhelmstr. 32',
  zip: '51379',
  city: 'Leverkusen',
  country: 'Deutschland',
  email: 'primehubgbr@gmail.com',
  vatId: 'DE455808625',
  partners: ['Minat Bopkhoeva', 'Seydi Cetinkaya'],
  domain: 'primehubgbr.com',
  url: 'https://primehubgbr.com',
} as const

// Geschäftsbereiche für die Landing Page
export const BUSINESS_AREAS = [
  {
    title: 'Antiquariat',
    desc: 'An- und Verkauf von Büchern im Versandhandel — kuratiert, geprüft und preisgebunden gehandelt.',
  },
  {
    title: '3D-Druck',
    desc: 'Eigene Printfarm und Auftragsdruck als Dienstleistung — von Prototyp bis Kleinserie.',
  },
  {
    title: 'Kerzenmanufaktur',
    desc: 'Handgefertigte Kerzen aus Wachs- und Betonguss, inklusive Veredelung und Versiegelung.',
  },
  {
    title: 'Kosmetik',
    desc: 'Sorgfältig konfektionierte Kosmetikprodukte für den Versandhandel.',
  },
] as const
