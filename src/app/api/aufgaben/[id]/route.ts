import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { notifyTaskAssigned } from '@/lib/notify-task'

// Permissive UUID-Pruefung (siehe POST-Route): Seed-/Demo-Mitarbeiter haben
// hand-gebaute IDs, die Zods strenges .uuid() ablehnen wuerde.
const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Ungültige ID',
)

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'blocked']).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  due_date: z.string().optional().nullable(),
  reminder_at: z.string().optional().nullable(),
  reminder_email: z.string().email().optional().nullable(),
  assignee_ids: z.array(looseUuid).optional(),
  org_node_id: looseUuid.optional().nullable(),
})

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { data, error } = await service
    .from('tasks')
    .select(`
      id, title, description, status, priority,
      due_date, reminder_at, reminder_email, reminder_sent,
      created_by, created_at, updated_at, completed_at, completed_by,
      completed_by_employee:employees!completed_by ( name ),
      org_node_id,
      task_assignees (
        employee_id,
        employees ( id, name, color )
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  const task = {
    ...data,
    assignees: (data.task_assignees ?? []).map((a: any) => a.employees).filter(Boolean),
    completed_by_name: (data as any).completed_by_employee?.name ?? null,
    completed_by_employee: undefined,
    task_assignees: undefined,
  }

  return NextResponse.json({ task })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { assignee_ids, ...updates } = parsed.data
  const service = createSupabaseServiceClient()

  const updatePayload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  if (updates.status) {
    updatePayload.completed_at =
      updates.status === 'done' ? new Date().toISOString() : null
  }

  const { error: taskError } = await service
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)

  if (taskError) return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })

  if (assignee_ids !== undefined) {
    // Alte Zuweisungen merken, um nur NEU hinzugefügte zu benachrichtigen.
    const { data: existing } = await service
      .from('task_assignees')
      .select('employee_id')
      .eq('task_id', id)
    const oldIds = new Set((existing ?? []).map((r: any) => r.employee_id))

    await service.from('task_assignees').delete().eq('task_id', id)
    if (assignee_ids.length > 0) {
      const assignees = assignee_ids.map((employee_id) => ({ task_id: id, employee_id }))
      await service.from('task_assignees').insert(assignees)
    }

    const newly = assignee_ids.filter((e) => !oldIds.has(e))
    const sb = await createSupabaseServerClient()
    const { data: { session } } = await sb.auth.getSession()
    await notifyTaskAssigned(id, newly, session?.access_token ?? null)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { error } = await service.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 })

  return NextResponse.json({ success: true })
}
