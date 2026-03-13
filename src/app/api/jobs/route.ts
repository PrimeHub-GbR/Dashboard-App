import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac } from 'crypto'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { WORKFLOW_CONFIGS, MAX_FILE_SIZE_BYTES } from '@/lib/workflow-config'
import type { WorkflowKey } from '@/lib/job-types'

// Simple in-process rate limiter: max 10 job submissions per user per minute.
// Note: resets on server restart. For multi-instance deployments, use a shared store (e.g. Upstash Redis).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

function signOutboundPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

const workflowKeySchema = z.enum([
  'sellerboard',
  'kulturgut',
  'a43-export',
  'avus-export',
  'blank-export',
  'repricer-updater',
  'ean2bbp',
])

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via cookies (SSR client)
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      )
    }

    // 2. Rate limiting
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte warte eine Minute.' },
        { status: 429 }
      )
    }

    // 3. Parse FormData
    const formData = await request.formData()
    const rawWorkflowKey = formData.get('workflow_key')
    const file = formData.get('file') as File | null

    // 3. Validate workflow_key with Zod
    const parseResult = workflowKeySchema.safeParse(rawWorkflowKey)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Ungültiger Workflow-Key' },
        { status: 400 }
      )
    }
    const workflowKey = parseResult.data as WorkflowKey
    const config = WORKFLOW_CONFIGS[workflowKey]

    // 4. Validate file presence based on workflow config
    if (config.acceptsFile && !file) {
      return NextResponse.json(
        { error: 'Datei wird für diesen Workflow benötigt' },
        { status: 400 }
      )
    }

    if (file && !config.acceptsFile) {
      return NextResponse.json(
        { error: 'Dieser Workflow akzeptiert keine Datei' },
        { status: 400 }
      )
    }

    // 5. Validate file size and MIME type
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'Datei darf maximal 50 MB groß sein' },
          { status: 400 }
        )
      }

      if (
        config.acceptedMimeTypes.length > 0 &&
        !config.acceptedMimeTypes.includes(file.type)
      ) {
        return NextResponse.json(
          { error: `Ungültiger Dateityp: ${file.type}` },
          { status: 400 }
        )
      }
    }

    // 6. Service role client for DB operations (bypasses RLS)
    const supabase = createSupabaseServiceClient()

    // 7. Admin-only role check
    if (config.adminOnly) {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (roleError || !roleData || roleData.role !== 'admin') {
        return NextResponse.json(
          { error: `Keine Berechtigung für ${config.label}` },
          { status: 403 }
        )
      }
    }

    // 8. Upload file if present
    let inputFileUrl: string | null = null
    let inputFilePath: string | null = null

    if (file) {
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      inputFilePath = `${user.id}/${timestamp}-${sanitizedName}`

      const fileBuffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await supabase.storage
        .from('workflow-uploads')
        .upload(inputFilePath, fileBuffer, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: `Upload fehlgeschlagen: ${uploadError.message}` },
          { status: 500 }
        )
      }

      inputFileUrl = inputFilePath
    }

    // 9. Create job record in DB
    const { data: job, error: insertError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        workflow_key: workflowKey,
        input_file_url: inputFileUrl,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError || !job) {
      return NextResponse.json(
        { error: `Job konnte nicht erstellt werden: ${insertError?.message}` },
        { status: 500 }
      )
    }

    // 10. Trigger n8n webhook
    const n8nBaseUrl = process.env.N8N_WEBHOOK_BASE_URL
    if (!n8nBaseUrl) {
      // Mark job as failed if n8n URL is not configured
      await supabase
        .from('jobs')
        .update({ status: 'failed', error_message: 'N8N Webhook URL nicht konfiguriert' })
        .eq('id', job.id)

      return NextResponse.json(
        { error: 'N8N Webhook URL nicht konfiguriert' },
        { status: 500 }
      )
    }

    const callbackUrl = `${request.nextUrl.origin}/api/jobs/${job.id}/callback`
    const hmacSecret = process.env.N8N_HMAC_SECRET

    try {
      const outboundBody = JSON.stringify({
        job_id: job.id,
        workflow_key: workflowKey,
        input_file_path: inputFilePath,
        callback_url: callbackUrl,
      })

      const outboundHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (hmacSecret) {
        outboundHeaders['x-dashboard-signature'] = signOutboundPayload(outboundBody, hmacSecret)
      }

      const n8nResponse = await fetch(`${n8nBaseUrl}/${workflowKey}`, {
        method: 'POST',
        headers: outboundHeaders,
        body: outboundBody,
      })

      if (!n8nResponse.ok) {
        const errText = await n8nResponse.text().catch(() => 'Unbekannter Fehler')
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: `n8n Fehler (${n8nResponse.status}): ${errText}`,
          })
          .eq('id', job.id)

        return NextResponse.json(
          { error: `Workflow konnte nicht gestartet werden` },
          { status: 502 }
        )
      }

      // Update job to running
      await supabase
        .from('jobs')
        .update({ status: 'running' })
        .eq('id', job.id)
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Netzwerkfehler'
      await supabase
        .from('jobs')
        .update({ status: 'failed', error_message: `n8n nicht erreichbar: ${message}` })
        .eq('id', job.id)

      return NextResponse.json(
        { error: 'n8n Webhook nicht erreichbar' },
        { status: 502 }
      )
    }

    // 11. Return the created job (re-fetch to get updated status)
    const { data: updatedJob } = await supabase
      .from('jobs')
      .select()
      .eq('id', job.id)
      .single()

    return NextResponse.json(updatedJob ?? job, { status: 201 })
  } catch (err) {
    console.error('POST /api/jobs error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}
