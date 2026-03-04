import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { WorkflowStat } from './WorkflowMonitorClient'

interface WorkflowRowProps {
  workflow: WorkflowStat
  isAdmin: boolean
  onToggle: (id: string, currentActive: boolean) => void
}

function formatLastRun(
  lastRunAt: string | null,
  lastRunSuccess: boolean | null
): string {
  if (!lastRunAt) return 'Noch nie ausgeführt'

  const date = new Date(lastRunAt)
  const formatted = date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const icon = lastRunSuccess === false ? ' ✗' : ' ✓'
  return formatted + icon
}

function formatErrorRate(
  rate: number | null,
  executions: number
): string {
  if (executions === 0 || rate === null) return '–'
  return `${Math.round(rate * 100)}%`
}

export function WorkflowRow({ workflow, isAdmin, onToggle }: WorkflowRowProps) {
  const lastRunText = formatLastRun(workflow.lastRunAt, workflow.lastRunSuccess)
  const errorRateText = formatErrorRate(
    workflow.errorRateLast30Days,
    workflow.executionsLast30Days
  )
  const isError =
    workflow.lastRunSuccess === false && workflow.lastRunAt !== null

  return (
    <TableRow>
      <TableCell className="font-medium">{workflow.name}</TableCell>
      <TableCell>
        {workflow.active ? (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            Aktiv
          </Badge>
        ) : (
          <Badge variant="secondary">Inaktiv</Badge>
        )}
      </TableCell>
      <TableCell
        className={isError ? 'text-destructive' : 'text-muted-foreground'}
      >
        {lastRunText}
      </TableCell>
      <TableCell className="text-right">{workflow.executionsLast30Days}</TableCell>
      <TableCell className="text-right">{errorRateText}</TableCell>
      <TableCell className="text-center">
        {isAdmin ? (
          <Switch
            checked={workflow.active}
            onCheckedChange={() => onToggle(workflow.id, workflow.active)}
            aria-label={`Workflow ${workflow.name} ${workflow.active ? 'deaktivieren' : 'aktivieren'}`}
          />
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">
                  <Switch
                    checked={workflow.active}
                    disabled
                    aria-label="Nur Admins können Workflows aktivieren/deaktivieren"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Nur Admins können Workflows aktivieren/deaktivieren
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </TableCell>
    </TableRow>
  )
}
