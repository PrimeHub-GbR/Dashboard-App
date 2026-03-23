'use client'

import { useLiveCheckins } from '@/hooks/useLiveCheckins'
import { formatTimeBerlin, formatDuration } from '@/lib/zeiterfassung/timezone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Clock, Users } from 'lucide-react'

export function LiveUebersicht() {
  const { checkins, loading } = useLiveCheckins()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-green-400" />
          Aktuell anwesend
        </h2>
        <Badge variant="secondary" className="gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Live
        </Badge>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : checkins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Niemand ist aktuell eingestempelt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {checkins.map((c) => (
            <Card key={c.entry_id} className="relative overflow-hidden">
              {c.arbzg_warning && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-500" />
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: c.employee_color }}
                  />
                  {c.employee_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Eingestempelt: {formatTimeBerlin(c.checked_in_at)} Uhr
                </p>
                <p className="text-sm font-medium">
                  Arbeitszeit: {formatDuration(c.duration_minutes)}
                </p>
                {c.arbzg_warning && (
                  <div className="flex items-center gap-1 text-yellow-500 text-xs mt-2">
                    <AlertTriangle className="w-3 h-3" />
                    Pausenpflicht (ArbZG § 4)
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
