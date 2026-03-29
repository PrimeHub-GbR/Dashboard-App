'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Plus, List, LayoutGrid, GitBranch, RefreshCw } from 'lucide-react'
import { useAufgaben, computeKPIs, Task, TaskFilters, CreateTaskPayload } from '@/hooks/useAufgaben'
import { useEmployees } from '@/hooks/useEmployees'
import { AufgabenKPIs } from './AufgabenKPIs'
import { AufgabenFilterBar } from './AufgabenFilterBar'
import { AufgabenListView } from './AufgabenListView'
import { AufgabenKanbanView } from './AufgabenKanbanView'
import { AufgabenDialog } from './AufgabenDialog'
import { OrgTreeView } from './OrgTreeView'

export function AufgabenClient() {
  const [filters, setFilters] = useState<TaskFilters>({})
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultOrgNodeId, setDefaultOrgNodeId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('list')

  const { tasks, isLoading, error, refresh, createTask, updateTask, deleteTask, completeTask } =
    useAufgaben(filters)

  const { employees } = useEmployees()

  const kpis = computeKPIs(tasks)

  const handleNewTask = (orgNodeId?: string) => {
    setSelectedTask(null)
    setDefaultOrgNodeId(orgNodeId ?? null)
    setDialogOpen(true)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setDefaultOrgNodeId(null)
    setDialogOpen(true)
  }

  const handleSave = async (payload: CreateTaskPayload): Promise<boolean> => {
    if (selectedTask) {
      return updateTask(selectedTask.id, payload)
    }
    return createTask(payload)
  }

  // In the Baum tab we load ALL tasks (no filters) so the tree is always complete
  const { tasks: allTasks } = useAufgaben({})

  return (
    <div className="space-y-6">
      {/* KPI-Leiste */}
      <AufgabenKPIs kpis={kpis} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="list" className="gap-1.5">
              <List className="h-3.5 w-3.5" /> Liste
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="tree" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> Baum
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => handleNewTask()} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Neue Aufgabe
            </Button>
          </div>
        </div>

        {/* Filter-Bar (nur für Liste + Kanban) */}
        {activeTab !== 'tree' && (
          <AufgabenFilterBar
            filters={filters}
            employees={employees ?? []}
            onChange={setFilters}
          />
        )}

        {/* Fehler */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <TabsContent value="list" className="mt-0">
          {isLoading ? <LoadingState /> : (
            <AufgabenListView
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onComplete={async (id) => completeTask(id)}
            />
          )}
        </TabsContent>

        <TabsContent value="kanban" className="mt-0">
          {isLoading ? <LoadingState /> : (
            <AufgabenKanbanView tasks={tasks} onTaskClick={handleTaskClick} />
          )}
        </TabsContent>

        <TabsContent value="tree" className="mt-0">
          <OrgTreeView
            tasks={allTasks}
            onTaskClick={handleTaskClick}
            onComplete={async (id) => completeTask(id)}
            onNewTaskWithNode={(nodeId) => handleNewTask(nodeId)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <AufgabenDialog
        open={dialogOpen}
        task={selectedTask}
        employees={employees ?? []}
        defaultOrgNodeId={defaultOrgNodeId}
        onClose={() => { setDialogOpen(false); setSelectedTask(null); setDefaultOrgNodeId(null) }}
        onSave={handleSave}
        onDelete={async (id) => deleteTask(id)}
        onComplete={async (id) => completeTask(id)}
      />
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rounded-md border divide-y">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 px-4 flex items-center">
          <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  )
}
