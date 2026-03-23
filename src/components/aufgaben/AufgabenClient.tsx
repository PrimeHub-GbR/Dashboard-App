'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Plus, List, LayoutGrid, RefreshCw } from 'lucide-react'
import { useAufgaben, computeKPIs, Task, TaskFilters, CreateTaskPayload } from '@/hooks/useAufgaben'
import { useEmployees } from '@/hooks/useEmployees'
import { AufgabenKPIs } from './AufgabenKPIs'
import { AufgabenFilterBar } from './AufgabenFilterBar'
import { AufgabenListView } from './AufgabenListView'
import { AufgabenKanbanView } from './AufgabenKanbanView'
import { AufgabenDialog } from './AufgabenDialog'

export function AufgabenClient() {
  const [filters, setFilters] = useState<TaskFilters>({})
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { tasks, isLoading, error, refresh, createTask, updateTask, deleteTask, completeTask } =
    useAufgaben(filters)

  const { employees } = useEmployees()

  const kpis = computeKPIs(tasks)

  const handleNewTask = () => {
    setSelectedTask(null)
    setDialogOpen(true)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setDialogOpen(true)
  }

  const handleSave = async (payload: CreateTaskPayload): Promise<boolean> => {
    if (selectedTask) {
      return updateTask(selectedTask.id, payload)
    }
    return createTask(payload)
  }

  const handleDelete = async (id: string): Promise<boolean> => deleteTask(id)
  const handleComplete = async (id: string): Promise<boolean> => completeTask(id)

  return (
    <div className="space-y-6">
      {/* KPI-Leiste */}
      <AufgabenKPIs kpis={kpis} />

      {/* Tabs: Liste / Kanban */}
      <Tabs defaultValue="list" className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-white/5 border border-white/10 h-9">
            <TabsTrigger value="list" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 h-7 px-3 gap-1.5 text-sm">
              <List className="h-3.5 w-3.5" /> Liste
            </TabsTrigger>
            <TabsTrigger value="kanban" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 h-7 px-3 gap-1.5 text-sm">
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
              className="h-9 px-3 text-white/40 hover:text-white/70 hover:bg-white/5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={handleNewTask}
              size="sm"
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Neue Aufgabe
            </Button>
          </div>
        </div>

        {/* Filter-Bar */}
        <AufgabenFilterBar
          filters={filters}
          employees={employees ?? []}
          onChange={setFilters}
        />

        {/* Fehler */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Listen-View */}
        <TabsContent value="list" className="mt-0">
          {isLoading ? (
            <LoadingState />
          ) : (
            <AufgabenListView
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onComplete={handleComplete}
            />
          )}
        </TabsContent>

        {/* Kanban-View */}
        <TabsContent value="kanban" className="mt-0">
          {isLoading ? (
            <LoadingState />
          ) : (
            <AufgabenKanbanView tasks={tasks} onTaskClick={handleTaskClick} />
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <AufgabenDialog
        open={dialogOpen}
        task={selectedTask}
        employees={employees ?? []}
        onClose={() => {
          setDialogOpen(false)
          setSelectedTask(null)
        }}
        onSave={handleSave}
        onDelete={handleDelete}
        onComplete={handleComplete}
      />
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" />
      ))}
    </div>
  )
}
