import { z } from 'zod'
import type { WorkflowKey } from './job-types'

export interface WorkflowConfig {
  key: WorkflowKey
  label: string
  acceptsFile: boolean
  hasResultFile: boolean
  adminOnly: boolean
  acceptedMimeTypes: string[]
  acceptedExtensions: string
}

export const WORKFLOW_CONFIGS: Record<WorkflowKey, WorkflowConfig> = {
  sellerboard: {
    key: 'sellerboard',
    label: 'Sellerboard Import',
    acceptsFile: true,
    hasResultFile: false,
    adminOnly: false,
    acceptedMimeTypes: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    acceptedExtensions: '.csv,.xlsx,.xls',
  },
  kulturgut: {
    key: 'kulturgut',
    label: 'Kulturgut Katalog',
    acceptsFile: true,
    hasResultFile: true,
    adminOnly: false,
    acceptedMimeTypes: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    acceptedExtensions: '.csv,.xlsx,.xls',
  },
  'a43-export': {
    key: 'a43-export',
    label: 'A43 Export',
    acceptsFile: true,
    hasResultFile: true,
    adminOnly: false,
    acceptedMimeTypes: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    acceptedExtensions: '.csv,.xlsx,.xls',
  },
  'avus-export': {
    key: 'avus-export',
    label: 'Avus Export',
    acceptsFile: true,
    hasResultFile: true,
    adminOnly: true,
    acceptedMimeTypes: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    acceptedExtensions: '.csv,.xlsx,.xls',
  },
  'blank-export': {
    key: 'blank-export',
    label: 'Blank Export',
    acceptsFile: false,
    hasResultFile: true,
    adminOnly: false,
    acceptedMimeTypes: [],
    acceptedExtensions: '',
  },
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export const fileValidationSchema = z.object({
  name: z.string(),
  size: z.number().max(MAX_FILE_SIZE_BYTES, 'Datei darf maximal 50 MB groß sein'),
  type: z.string(),
})
