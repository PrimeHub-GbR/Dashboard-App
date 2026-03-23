'use client'

import { useCallback, useEffect, useState } from 'react'

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface TaskAssignee {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  reminder_at: string | null
  reminder_email: string | null
  reminder_sent: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  assignees: TaskAssignee[]
}

export interface TaskFilters {
  status?: string
  priority?: string
  employee_id?: string
  due_filter?: 'overdue' | 'today' | 'week' | ''
  search?: string
}

export interface CreateTaskPayload {
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date?: string | null
  reminder_at?: string | null
  reminder_email?: string | null
  assignee_ids: string[]
}

export function useAufgaben(filters: TaskFilters = {}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const buildUrl = useCallback((f: TaskFilters) => {
    const params = new URLSearchParams()
    if (f.status) params.set('status', f.status)
    if (f.priority) params.set('priority', f.priority)
    if (f.employee_id) params.set('employee_id', f.employee_id)
    if (f.due_filter) params.set('due_filter', f.due_filter)
    if (f.search) params.set('search', f.search)
    return `/api/aufgaben?${params.toString()}`
  }, [])

  const load = useCallback(async (f: TaskFilters) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(buildUrl(f))
      if (!res.ok) throw new Error('Fehler beim Laden')
      const json = await res.json()
      setTasks(json.tasks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setIsLoading(false)
    }
  }, [buildUrl])

  useEffect(() => {
    load(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.priority, filters.employee_id, filters.due_filter, filters.search])

  const refresh = () => load(filters)

  const createTask = async (payload: CreateTaskPayload): Promise<boolean> => {
    try {
      const res = await fetch('/api/aufgaben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return false
      await load(filters)
      return true
    } catch {
      return false
    }
  }

  const updateTask = async (id: string, updates: Partial<CreateTaskPayload>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/aufgaben/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) return false
      await load(filters)
      return true
    } catch {
      return false
    }
  }

  const deleteTask = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/aufgaben/${id}`, { method: 'DELETE' })
      if (!res.ok) return false
      setTasks((prev) => prev.filter((t) => t.id !== id))
      return true
    } catch {
      return false
    }
  }

  const completeTask = async (id: string): Promise<boolean> => {
    return updateTask(id, { status: 'done' } as Partial<CreateTaskPayload>)
  }

  return { tasks, isLoading, error, refresh, createTask, updateTask, deleteTask, completeTask }
}

// KPI-Berechnungen
export function computeKPIs(tasks: Task[]) {
  const today = new Date().toISOString().split('T')[0]
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const open = total - done
  const overdue = tasks.filter(
    (t) => t.due_date && t.due_date < today && t.status !== 'done'
  ).length
  const rate = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, done, open, overdue, rate }
}
