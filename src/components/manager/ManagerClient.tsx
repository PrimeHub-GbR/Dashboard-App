'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Reminder, CompanyInfo } from '@/lib/manager'
import { ManagerReminders } from './ManagerReminders'
import { ManagerCalendar } from './ManagerCalendar'
import { ManagerCompanyInfo } from './ManagerCompanyInfo'

export function ManagerClient() {
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
    loadInfo()
  }, [loadReminders, loadInfo])

  return (
    <Tabs defaultValue="reminders" className="space-y-6">
      <TabsList>
        <TabsTrigger value="reminders">Fristen</TabsTrigger>
        <TabsTrigger value="calendar">Kalender</TabsTrigger>
        <TabsTrigger value="company">Firmeninfos</TabsTrigger>
      </TabsList>

      <TabsContent value="reminders">
        <ManagerReminders
          reminders={reminders}
          loading={remindersLoading}
          onChanged={loadReminders}
        />
      </TabsContent>

      <TabsContent value="calendar">
        <ManagerCalendar reminders={reminders} loading={remindersLoading} />
      </TabsContent>

      <TabsContent value="company">
        <ManagerCompanyInfo info={info} loading={infoLoading} onChanged={loadInfo} />
      </TabsContent>
    </Tabs>
  )
}
