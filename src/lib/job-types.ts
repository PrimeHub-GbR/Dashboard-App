export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout'

export type WorkflowKey =
  | 'sellerboard'
  | 'kulturgut'
  | 'a43-export'
  | 'avus-export'
  | 'blank-export'
  | 'repricer-updater'
  | 'ean2bbp'

export interface Job {
  id: string
  user_id: string
  workflow_key: WorkflowKey
  input_file_url: string | null
  result_file_url: string | null
  status: JobStatus
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
