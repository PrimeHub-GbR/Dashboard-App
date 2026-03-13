'use client'

import { useJobs } from '@/hooks/useJobs'
import { useUserRole } from '@/hooks/useUserRole'
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkflowTile } from './WorkflowTile'
import { ActiveJobsBanner } from './ActiveJobsBanner'
import { JobHistoryTable } from './JobHistoryTable'

export function WorkflowHubClient() {
  const { jobs, isLoading: jobsLoading, error: jobsError, refresh } = useJobs()
  const { role, isLoading: roleLoading } = useUserRole()

  const activeJobs = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'running'
  )

  const visibleWorkflows = Object.values(WORKFLOW_CONFIGS).filter(
    (config) => !(config.adminOnly && role !== 'admin')
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Workflow Tiles Grid */}
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/30">
          Verfügbare Workflows
        </p>
        {roleLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleWorkflows.map((config) => (
              <WorkflowTile key={config.key} config={config} />
            ))}
          </div>
        )}
      </div>

      <ActiveJobsBanner jobs={activeJobs} />
      <JobHistoryTable jobs={jobs} isLoading={jobsLoading} error={jobsError} onClear={refresh} />
    </div>
  )
}
