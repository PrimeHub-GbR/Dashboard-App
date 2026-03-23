import { ShieldX } from 'lucide-react'

export const metadata = { title: 'Zugriff verweigert' }

export default function KioskBlockedPage() {
  return (
    <div className="min-h-screen bg-[#0a1510] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldX className="w-10 h-10 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Zugriff nicht erlaubt</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Dieses Gerät ist nicht als Kiosk registriert.<br />
            Die Zeiterfassung kann nur am autorisierten Kiosk-Gerät genutzt werden.
          </p>
        </div>
        <p className="text-gray-700 text-xs">
          Administrator: Gerät einmalig unter <span className="text-gray-500">/api/kiosk/register?key=…</span> registrieren
        </p>
      </div>
    </div>
  )
}
