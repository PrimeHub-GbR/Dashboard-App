'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatDuration } from '@/lib/zeiterfassung/timezone'
import type { WeeklySchedule } from '@/lib/zeiterfassung/types'

interface DailyRow {
  work_date: string
  employee_id: string
  net_minutes: number
}

interface Props {
  employee: {
    id: string
    name: string
    color: string
    weekly_schedule: WeeklySchedule
  }
  daily: DailyRow[]
  year: number
  month: number
}

const WEEKDAY_KEY: Record<number, keyof WeeklySchedule> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
}

function buildSollIstData(
  employee: Props['employee'],
  daily: DailyRow[],
  year: number,
  month: number,
) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month
    ? today.getDate()
    : daysInMonth

  // Lookup: day → net_hours
  const istLookup: Record<number, number> = {}
  for (const row of daily) {
    if (row.employee_id !== employee.id) continue
    const d = new Date(row.work_date).getDate()
    istLookup[d] = (istLookup[d] ?? 0) + row.net_minutes / 60
  }

  let cumSoll = 0
  let cumIst = 0

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const date = new Date(year, month - 1, day)
    const weekdayKey = WEEKDAY_KEY[date.getDay()]
    const sollH = employee.weekly_schedule[weekdayKey] ?? 0
    cumSoll = Math.round((cumSoll + sollH) * 10) / 10

    let ist: number | null = null
    if (day <= todayDay) {
      cumIst = Math.round((cumIst + (istLookup[day] ?? 0)) * 10) / 10
      ist = cumIst
    }

    return {
      tag: `${day}.`,
      soll: cumSoll,
      ist,
    }
  })
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number | null; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const soll = payload.find(p => p.name === 'soll')?.value ?? 0
  const ist = payload.find(p => p.name === 'ist')?.value
  const diff = ist !== null && ist !== undefined ? ist - soll : null

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-medium mb-2">Tag {label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />Soll
          </span>
          <span className="font-medium">{soll}h</span>
        </div>
        {ist !== null && ist !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: payload.find(p => p.name === 'ist')?.color }} />Ist
            </span>
            <span className="font-medium">{ist}h</span>
          </div>
        )}
        {diff !== null && (
          <div className={`flex justify-between gap-4 pt-1 border-t ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            <span className="font-medium">Abweichung</span>
            <span className="font-bold">{diff >= 0 ? '+' : ''}{Math.round(diff * 10) / 10}h</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MitarbeiterChart({ employee, daily, year, month }: Props) {
  const data = buildSollIstData(employee, daily, year, month)
  const lastIst = [...data].reverse().find(d => d.ist !== null)
  const lastSoll = data[data.length - 1]?.soll ?? 0
  const currentDiff = lastIst ? Math.round((lastIst.ist! - lastIst.soll) * 10) / 10 : null

  return (
    <div className="space-y-3">
      {/* Status-Badge */}
      {currentDiff !== null && (
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: employee.color }}
          />
          <span className="text-sm font-medium">{employee.name}</span>
          <span className={`ml-auto text-sm font-bold px-2 py-0.5 rounded-full ${
            currentDiff >= 0
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
          }`}>
            {currentDiff >= 0 ? '+' : ''}{formatDuration(Math.abs(currentDiff) * 60)}
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`ist-grad-${employee.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={employee.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={employee.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="tag"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}h`}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Soll-Linie (gestrichelt, grau) */}
          <Line
            type="monotone"
            dataKey="soll"
            stroke="#6b7280"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            name="soll"
            connectNulls
          />

          {/* Ist-Fläche (Mitarbeiterfarbe) */}
          <Area
            type="monotone"
            dataKey="ist"
            stroke={employee.color}
            strokeWidth={2.5}
            fill={`url(#ist-grad-${employee.id})`}
            dot={false}
            activeDot={{ r: 4, fill: employee.color }}
            name="ist"
            connectNulls={false}
          />

          {/* Referenzlinie: Monats-Soll */}
          <ReferenceLine
            y={lastSoll}
            stroke="#6b7280"
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          Soll-Verlauf (kumulativ)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded inline-block" style={{ backgroundColor: employee.color }} />
          Ist-Verlauf (kumulativ)
        </span>
      </div>
    </div>
  )
}
