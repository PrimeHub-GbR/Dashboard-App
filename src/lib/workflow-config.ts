import { z } from 'zod'
import type { WorkflowKey } from './job-types'

export interface WorkflowConfig {
  key: WorkflowKey
  label: string
  description: string
  acceptsFile: boolean
  hasResultFile: boolean
  adminOnly: boolean
  acceptedMimeTypes: string[]
  acceptedExtensions: string
  verified?: boolean
}

export const WORKFLOW_CONFIGS: Record<WorkflowKey, WorkflowConfig> = {
  sellerboard: {
    key: 'sellerboard',
    label: 'Sellerboard Import',
    description: 'Sellerboard-Exporte verarbeiten und in die Datenbank importieren.',
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
    description: 'Kulturgut-Katalog verarbeiten und eine aufbereitete Ergebnis-Datei erstellen.',
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
    description: 'A43-Katalog exportieren, normalisieren und als Download bereitstellen.',
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
    description: 'Avus-Katalog exportieren und aufbereiten. Nur für Administratoren.',
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
    description: 'Leeren Export-Job starten und eine leere Exportdatei generieren.',
    acceptsFile: false,
    hasResultFile: true,
    adminOnly: false,
    acceptedMimeTypes: [],
    acceptedExtensions: '',
  },
  'repricer-updater': {
    key: 'repricer-updater',
    label: 'Repricer CSV Update',
    description: 'Repricer-CSV mit aktuellen Marktpreisen befüllen und als Download bereitstellen.',
    acceptsFile: true,
    hasResultFile: true,
    adminOnly: true,
    acceptedMimeTypes: ['text/csv', 'application/vnd.ms-excel', ''],
    acceptedExtensions: '.csv',
  },
  isbn2ean: {
    key: 'isbn2ean',
    label: 'ISBN / ASIN → EAN',
    description: 'Excel- oder CSV-Datei mit ISBN10- oder ASIN-Spalte hochladen und EAN-13-Barcodes berechnen lassen.',
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
  ean2bbp: {
    key: 'ean2bbp',
    label: 'EAN Nummer → Buchbindungspreis',
    description: 'EAN-Liste hochladen und per VLB-API den Buchbindungspreis (BBP) ergänzen.',
    acceptsFile: true,
    hasResultFile: true,
    adminOnly: false,
    acceptedMimeTypes: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    acceptedExtensions: '.csv,.xlsx,.xls',
    verified: true,
  },
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export const fileValidationSchema = z.object({
  name: z.string(),
  size: z.number().max(MAX_FILE_SIZE_BYTES, 'Datei darf maximal 50 MB groß sein'),
  type: z.string(),
})
