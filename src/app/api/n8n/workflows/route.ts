import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const N8N_BASE_URL = process.env.N8N_BASE_URL
const N8N_API_KEY = process.env.N8N_API_KEY

interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  updatedAt: string
}

interface N8nExecution {
  id: string
  finished: boolean
  stoppedAt: string | null
  status: 'success' | 'error' | 'crashed' | 'waiting' | 'running' | 'new'
}

interface N8nExecutionsResponse {
  data: N8nExecution[]
}

interface N8nWorkflowsResponse {
  data: N8nWorkflow[]
}

async function n8nFetch<T>(path: string): Promise<T> {
  if (!N8N_BASE_URL || !N8N_API_KEY) {
    throw new Error('N8N_BASE_URL oder N8N_API_KEY nicht konfiguriert')
  }
  const res = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    next: { revalidate: 300 },
  })
  if (!res.ok) {
    throw new Error(`n8n API Fehler: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`workflows:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
  }

  try {
    // Auth check
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // Fetch workflow list from n8n
    const { data: workflows } = await n8nFetch<N8nWorkflowsResponse>('/workflows')

    // Fetch executions per workflow with a concurrency cap of 5
    const CONCURRENCY = 5
    const statsResults: PromiseSettledResult<N8nExecutionsResponse>[] = []
    for (let i = 0; i < workflows.length; i += CONCURRENCY) {
      const batch = workflows.slice(i, i + CONCURRENCY).map((wf) =>
        n8nFetch<N8nExecutionsResponse>(
          `/executions?workflowId=${wf.id}&limit=100&includeData=false`
        )
      )
      statsResults.push(...(await Promise.allSettled(batch)))
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    const result = workflows.map((wf, i) => {
      const execResult = statsResults[i]
      const executions: N8nExecution[] =
        execResult.status === 'fulfilled' ? execResult.value.data : []

      // Filter to last 30 days (finished executions only)
      const recent = executions.filter(
        (e) => e.stoppedAt && new Date(e.stoppedAt).getTime() >= thirtyDaysAgo
      )

      const errorCount = recent.filter(
        (e) => e.status === 'error' || e.status === 'crashed'
      ).length

      const errorRate = recent.length > 0 ? errorCount / recent.length : null

      // Most recent finished execution
      const sorted = executions
        .filter((e) => e.stoppedAt)
        .sort(
          (a, b) =>
            new Date(b.stoppedAt!).getTime() - new Date(a.stoppedAt!).getTime()
        )
      const lastExec = sorted[0] ?? null

      return {
        id: wf.id,
        name: wf.name,
        active: wf.active,
        lastRunAt: lastExec?.stoppedAt ?? null,
        lastRunSuccess: lastExec
          ? lastExec.status === 'success'
          : null,
        executionsLast30Days: recent.length,
        errorRateLast30Days: errorRate,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('GET /api/n8n/workflows error:', err)
    const msg = err instanceof Error ? err.message : 'Interner Fehler'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
