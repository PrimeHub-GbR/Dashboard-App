'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Reminder, CompanyInfo } from '@/lib/manager'
import { ManagerReminders } from './ManagerReminders'
import { ManagerCalendar } from './ManagerCalendar'
import { ManagerCompanyInfo } from './ManagerCompanyInfo'

interface ManagerClientProps {
  /** true = GF: verwalten + Firmeninfos. false = Manager: read-only Termine. */
  isAdmin: boolean
}

export function ManagerClient({ isAdmin }: ManagerClientProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [info, setInfo] = useState<CompanyInfo[]>([])
  const [remindersLoading, setRemindersLoading] = useState(true)
  const [infoLoading, setInfoLoading] = useState(true)

  const loadReminders = useCallback(async () => {
    setRemindersLoading(true)
    try {
      const res = await fetch('/api/manager/reminders')
      const json = await res.json()
      setReminders(json.reminders ?? [])
    } finally {
      setRemindersLoading(false)
    }
  }, [])

  const loadInfo = useCallback(async () => {
    setInfoLoading(true)
    try {
      const res = await fetch('/api/manager/company-info')
      const json = await res.json()
      setInfo(json.info ?? [])
    } finally {
      setInfoLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReminders()
    if (isAdmin) loadInfo()
  }, [loadReminders, loadInfo, isAdmin])

  return (
    <Tabs defaultValue="reminders" className="space-y-6">
      <TabsList>
        <TabsTrigger value="reminders">
          {isAdmin ? 'Fristen' : 'Termine'}
        </TabsTrigger>
        <TabsTrigger value="calendar">Kalender</TabsTrigger>
        {isAdmin && <TabsTrigger value="company">Firmeninfos</TabsTrigger>}
      </TabsList>

      <TabsContent value="reminders">
        <ManagerReminders
          reminders={reminders}
          loading={remindersLoading}
          canManage={isAdmin}
          onChanged={loadReminders}
        />
      </TabsContent>

      <TabsContent value="calendar">
        <ManagerCalendar reminders={reminders} loading={remindersLoading} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="company">
          <ManagerCompanyInfo info={info} loading={infoLoading} onChanged={loadInfo} />
        </TabsContent>
      )}
    </Tabs>
  )
}
