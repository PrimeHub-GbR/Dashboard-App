'use client'

import { useJobs } from '@/hooks/useJobs'
import { WorkflowCard } from './WorkflowCard'
import { ActiveJobsBanner } from './ActiveJobsBanner'
import { JobHistoryTable } from './JobHistoryTable'

export function WorkflowHubClient() {
  const { jobs, isLoading, error } = useJobs()

  const activeJobs = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'running'
  )

  return (
    <div className="flex flex-col gap-6">
      <WorkflowCard />
      <ActiveJobsBanner jobs={activeJobs} />
      <JobHistoryTable jobs={jobs} isLoading={isLoading} error={error} />
    </div>
  )
}
