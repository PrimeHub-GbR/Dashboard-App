'use client'

import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface HealthData {
  supabase: boolean
  n8n: boolean
  googleDrive: boolean
  checkedAt: string
}

const SERVICES = [
  { key: 'supabase' as const, label: 'Supabase' },
  { key: 'n8n' as const, label: 'n8n' },
  { key: 'googleDrive' as const, label: 'Google Drive' },
]

function StatusDot({ online, label }: { online: boolean | null; label: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <span
              className={[
                'h-2 w-2 rounded-full shrink-0',
                online === null
                  ? 'bg-muted-foreground/40 animate-pulse'
                  : online
                  ? 'bg-green-500'
                  : 'bg-red-500',
              ].join(' ')}
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {online === null ? 'Prüfe...' : online ? 'Verbunden' : 'Nicht erreichbar'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function McpStatus() {
  const [health, setHealth] = useState<HealthData | null>(null)

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (res.ok) {
        const data: HealthData = await res.json()
        setHealth(data)
      }
    } catch {
      // network error — keep previous state
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-1.5 px-0 py-1">
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">
        Verbindungen
      </p>
      {SERVICES.map(({ key, label }) => (
        <StatusDot
          key={key}
          label={label}
          online={health ? health[key] : null}
        />
      ))}
    </div>
  )
}
