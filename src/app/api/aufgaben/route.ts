import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'blocked']).default('todo'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  due_date: z.string().optional().nullable(),
  reminder_at: z.string().optional().nullable(),
  reminder_email: z.string().email().optional().nullable(),
  assignee_ids: z.array(z.string().uuid()).default([]),
  org_node_id: z.string().uuid().optional().nullable(),
})

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const employee_id = searchParams.get('employee_id')
  const due_filter = searchParams.get('due_filter')
  const search = searchParams.get('search')

  const service = createSupabaseServiceClient()

  const org_node_id = searchParams.get('org_node_id')

  let query = service
    .from('tasks')
    .select(`
      id, title, description, status, priority,
      due_date, reminder_at, reminder_email, reminder_sent,
      created_by, created_at, updated_at, completed_at,
      org_node_id,
      task_assignees (
        employee_id,
        employees ( id, name, color )
      )
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (search) query = query.ilike('title', `%${search}%`)
  if (org_node_id) query = query.eq('org_node_id', org_node_id)

  const today = new Date().toISOString().split('T')[0]
  if (due_filter === 'overdue') {
    query = query.lt('due_date', today).neq('status', 'done')
  } else if (due_filter === 'today') {
    query = query.eq('due_date', today)
  } else if (due_filter === 'week') {
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    query = query.lte('due_date', weekEnd.toISOString().split('T')[0]).gte('due_date', today)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })

  // employee_id Filter (post-fetch, da Supabase join filtering komplex)
  let tasks = data ?? []
  if (employee_id) {
    tasks = tasks.filter((t: any) =>
      t.task_assignees?.some((a: any) => a.employee_id === employee_id)
    )
  }

  // Assignees normalisieren
  const normalized = tasks.map((t: any) => ({
    ...t,
    assignees: (t.task_assignees ?? []).map((a: any) => a.employees).filter(Boolean),
    task_assignees: undefined,
  }))

  return NextResponse.json({ tasks: normalized })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { assignee_ids, org_node_id, ...taskData } = parsed.data
  const service = createSupabaseServiceClient()

  const { data: task, error: taskError } = await service
    .from('tasks')
    .insert({
      ...taskData,
      due_date: taskData.due_date || null,
      reminder_at: taskData.reminder_at || null,
      reminder_email: taskData.reminder_email || null,
      completed_at: taskData.status === 'done' ? new Date().toISOString() : null,
      created_by: user.id,
      org_node_id: org_node_id ?? null,
    })
    .select('id')
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }

  if (assignee_ids.length > 0) {
    const assignees = assignee_ids.map((employee_id) => ({ task_id: task.id, employee_id }))
    await service.from('task_assignees').insert(assignees)
  }

  return NextResponse.json({ task: { id: task.id } }, { status: 201 })
}
