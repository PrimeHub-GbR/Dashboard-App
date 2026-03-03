'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import type { WorkflowKey } from '@/lib/job-types'

interface WorkflowSelectorProps {
  role: 'admin' | 'staff' | null
  value: WorkflowKey | null
  onChange: (value: WorkflowKey) => void
  disabled?: boolean
}

export function WorkflowSelector({ role, value, onChange, disabled }: WorkflowSelectorProps) {
  const visibleWorkflows = Object.values(WORKFLOW_CONFIGS).filter(
    (config) => !(config.adminOnly && role !== 'admin')
  )

  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => onChange(val as WorkflowKey)}
      disabled={disabled || role === null}
    >
      <SelectTrigger aria-label="Workflow auswählen">
        <SelectValue placeholder="Workflow auswählen…" />
      </SelectTrigger>
      <SelectContent>
        {visibleWorkflows.map((config) => (
          <SelectItem key={config.key} value={config.key}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
