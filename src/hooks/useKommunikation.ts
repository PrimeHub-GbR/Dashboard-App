'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export type MessageContext = 'manual' | 'aufgabe' | 'zeiterfassung'
export type MessageStatus = 'pending' | 'sent' | 'failed'

export interface MessageLog {
  id: string
  created_at: string
  sent_by: string
  sent_by_email?: string
  recipient_id: string
  recipient_name?: string
  recipient_phone: string
  message_text: string
  context: MessageContext
  context_ref_id: string | null
  status: MessageStatus
  error_message: string | null
  n8n_triggered_at: string | null
}

export interface SendPayload {
  recipient_ids: string[]
  message: string
  context: MessageContext
  context_ref_id?: string | null
}

export interface HistoryFilters {
  recipient_id?: string
  context?: MessageContext | ''
  status?: MessageStatus | ''
  date_range?: 'today' | 'week' | 'month' | '90days' | ''
  page?: number
}

export interface HistoryResponse {
  logs: MessageLog[]
  total: number
  page: number
  page_size: number
}

export function useKommunikation() {
  const [sending, setSending] = useState(false)
  const [n8nUnconfigured, setN8nUnconfigured] = useState(false)

  const sendMessage = useCallback(async (payload: SendPayload): Promise<boolean> => {
    setSending(true)
    try {
      const res = await fetch('/api/kommunikation/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 503) {
        setN8nUnconfigured(true)
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? 'WhatsApp nicht konfiguriert')
        return false
      }

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast.error(`Fehler: ${data.error ?? 'Unbekannter Fehler'}`)
        return false
      }

      setN8nUnconfigured(false)
      toast.success('Nachricht gesendet')
      return true
    } catch {
      toast.error('Netzwerkfehler — bitte erneut versuchen')
      return false
    } finally {
      setSending(false)
    }
  }, [])

  return {
    sending,
    n8nUnconfigured,
    setN8nUnconfigured,
    sendMessage,
  }
}

export function useKommunikationHistory(filters: HistoryFilters) {
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (overrideFilters?: HistoryFilters) => {
    setLoading(true)
    setError(null)
    try {
      const f = overrideFilters ?? filters
      const params = new URLSearchParams()
      if (f.recipient_id) params.set('recipient_id', f.recipient_id)
      if (f.context) params.set('context', f.context)
      if (f.status) params.set('status', f.status)
      if (f.date_range) params.set('date_range', f.date_range)
      if (f.page) params.set('page', String(f.page))

      const res = await fetch(`/api/kommunikation/history?${params.toString()}`)
      if (!res.ok) throw new Error('Verlauf konnte nicht geladen werden')
      const data = await res.json() as HistoryResponse
      setLogs(data.logs)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [filters])

  return { logs, total, loading, error, refresh: load }
}
