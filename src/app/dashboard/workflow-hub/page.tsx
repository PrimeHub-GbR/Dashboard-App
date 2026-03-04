import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { WorkflowHubClient } from '@/components/workflow-hub/WorkflowHubClient'

export const metadata: Metadata = {
  title: 'Workflow Hub',
}

export default function WorkflowHubPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <PageHeader
          title="Workflow Hub"
          description="Dateien hochladen, n8n-Workflows starten und Ergebnisse herunterladen"
        />
      </div>
      <WorkflowHubClient />
    </div>
  )
}
