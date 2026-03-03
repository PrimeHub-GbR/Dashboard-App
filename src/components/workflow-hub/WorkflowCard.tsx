'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import type { WorkflowKey } from '@/lib/job-types'
import { useUserRole } from '@/hooks/useUserRole'
import { WorkflowSelector } from './WorkflowSelector'
import { FileDropZone } from './FileDropZone'

export function WorkflowCard() {
  const { role, isLoading: roleLoading, error: roleError } = useUserRole()
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowKey | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const workflowConfig = selectedWorkflow ? WORKFLOW_CONFIGS[selectedWorkflow] : null
  const showDropZone = workflowConfig?.acceptsFile ?? false
  const canSubmit =
    selectedWorkflow !== null &&
    (workflowConfig?.acceptsFile === false || selectedFile !== null) &&
    !isSubmitting

  function handleWorkflowChange(key: WorkflowKey) {
    setSelectedWorkflow(key)
    setSelectedFile(null) // reset file when workflow changes
  }

  async function handleSubmit() {
    if (!selectedWorkflow) return

    setIsSubmitting(true)
    setUploadProgress(0)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('workflow_key', selectedWorkflow)
        if (selectedFile) {
          formData.append('file', selectedFile)
        }

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            try {
              const body = JSON.parse(xhr.responseText)
              reject(new Error(body.error ?? 'Fehler beim Starten des Jobs'))
            } catch {
              reject(new Error('Fehler beim Starten des Jobs'))
            }
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')))

        xhr.open('POST', '/api/jobs')
        xhr.send(formData)
      })

      toast.success('Job gestartet — Status wird aktualisiert')
      setSelectedWorkflow(null)
      setSelectedFile(null)
      setUploadProgress(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Starten des Jobs')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow starten</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {roleError ? (
          <Alert variant="destructive">
            <AlertDescription>{roleError}</AlertDescription>
          </Alert>
        ) : roleLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <WorkflowSelector
            role={role}
            value={selectedWorkflow}
            onChange={handleWorkflowChange}
            disabled={isSubmitting}
          />
        )}

        {showDropZone && workflowConfig && (
          <FileDropZone
            config={workflowConfig}
            file={selectedFile}
            onFileChange={setSelectedFile}
          />
        )}

        {isSubmitting && uploadProgress > 0 && (
          <Progress value={uploadProgress} className="h-2" />
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full sm:w-auto sm:self-end"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Wird verarbeitet…
            </>
          ) : (
            'Workflow starten'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
