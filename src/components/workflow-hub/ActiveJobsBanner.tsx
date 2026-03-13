'use client'

import { Loader2 } from 'lucide-react'
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import type { Job } from '@/lib/job-types'
import { StatusBadge } from './StatusBadge'
import { CancelButton } from './CancelButton'

interface ActiveJobsBannerProps {
  jobs: Job[]
}

export function ActiveJobsBanner({ jobs }: ActiveJobsBannerProps) {
  if (jobs.length === 0) return null

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
      <div className="mb-2 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {jobs.length} Job{jobs.length > 1 ? 's' : ''} in Verarbeitung
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">
              {WORKFLOW_CONFIGS[job.workflow_key]?.label ?? job.workflow_key}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={job.status} />
              <CancelButton jobId={job.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
