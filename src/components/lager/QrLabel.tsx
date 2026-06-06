'use client'

import { QRCodeSVG } from 'qrcode.react'
import { Printer } from 'lucide-react'

/// Druckbares, laminierfähiges Lager-Etikett: Titel, QR-Code und die
/// automatische Bestellmenge. Über „Drucken" als PDF/Papier ausgeben.
export function QrLabel({
  title,
  quantity,
  url,
}: {
  title: string
  quantity: number
  url: string
}) {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Druck-Steuerung (im Druck ausgeblendet) */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4 print:hidden">
        <span className="text-sm text-gray-500">Etikett-Vorschau — zum Laminieren drucken</span>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
        >
          <Printer className="h-4 w-4" /> Drucken
        </button>
      </div>

      {/* Etikett */}
      <div className="flex items-center justify-center p-8 print:p-0">
        <div className="w-[340px] rounded-2xl border-2 border-black p-6 text-center print:rounded-none">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">
            Nachbestellung
          </p>
          <h1 className="mt-2 break-words text-2xl font-extrabold leading-tight">
            {title}
          </h1>

          <div className="my-5 flex justify-center">
            <div className="rounded-xl border border-gray-300 bg-white p-3">
              <QRCodeSVG value={url} size={200} level="M" />
            </div>
          </div>

          <p className="text-sm font-semibold text-gray-700">QR-Code scannen (PrimeHub-App)</p>
          <div className="mt-3 rounded-lg bg-black px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-white/70">Bestellmenge</p>
            <p className="text-3xl font-extrabold text-white">{quantity} Stück</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: white; }
          /* Dashboard-Rahmen (Sidebar, Padding) beim Drucken ausblenden */
          aside { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
        }
      `}</style>
    </div>
  )
}
