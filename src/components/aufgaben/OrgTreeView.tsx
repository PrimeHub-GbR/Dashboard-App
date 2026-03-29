'use client'

import { useState } from 'react'
import { OrgNode, useOrgNodes } from '@/hooks/useOrgNodes'
import { Task, CreateTaskPayload } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  Plus, Pencil, ChevronDown, ChevronRight, AlertTriangle, Calendar,
  Building2, Store, FolderOpen, Package, Layers,
} from 'lucide-react'
import { OrgNodeDialog } from './OrgNodeDialog'

// ── Type helpers ──────────────────────────────────────────────
const TYPE_ICONS: Record<string, React.ReactNode> = {
  account:  <Building2 className="h-3.5 w-3.5" />,
  store:    <Store className="h-3.5 w-3.5" />,
  category: <FolderOpen className="h-3.5 w-3.5" />,
  product:  <Package className="h-3.5 w-3.5" />,
  node:     <Layers className="h-3.5 w-3.5" />,
}

const PRIORITY_STYLES: Record<string, string> = {
  high:   'text-red-700 bg-red-50 border-red-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  low:    'text-green-700 bg-green-50 border-green-200',
}
const PRIORITY_LABELS: Record<string, string> = {
  high: 'Hoch', medium: 'Mittel', low: 'Niedrig',
}

const STATUS_STYLES: Record<string, string> = {
  todo:        'text-gray-600 bg-gray-100 border-gray-200',
  in_progress: 'text-blue-700 bg-blue-50 border-blue-200',
  in_review:   'text-purple-700 bg-purple-50 border-purple-200',
  done:        'text-green-700 bg-green-50 border-green-200',
  blocked:     'text-red-700 bg-red-50 border-red-200',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'Offen', in_progress: 'In Bearbeitung', in_review: 'In Review',
  done: 'Erledigt', blocked: 'Blockiert',
}

// ── Task-Mini-Row ─────────────────────────────────────────────
function TaskRow({
  task,
  onTaskClick,
  onComplete,
}: {
  task: Task
  onTaskClick: (t: Task) => void
  onComplete: (id: string) => Promise<boolean>
}) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
  const isDone = task.status === 'done'

  const formatDue = (due: string) => {
    const d = new Date(due)
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `${Math.abs(diff)}d überfällig`
    if (diff === 0) return 'Heute'
    if (diff === 1) return 'Morgen'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 transition-colors text-sm',
        isOverdue && !isDone && 'bg-red-50/60',
      )}
      onClick={() => onTaskClick(task)}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={async (checked) => {
          if (checked && !isDone) await onComplete(task.id)
        }}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 h-3.5 w-3.5"
      />
      <span className={cn('flex-1 min-w-0 truncate text-xs', isDone && 'line-through text-muted-foreground')}>
        {task.title}
      </span>
      <Badge variant="outline" className={cn('text-[10px] px-1 py-0 shrink-0 hidden sm:flex', STATUS_STYLES[task.status])}>
        {STATUS_LABELS[task.status]}
      </Badge>
      <Badge variant="outline" className={cn('text-[10px] px-1 py-0 shrink-0 hidden md:flex', PRIORITY_STYLES[task.priority])}>
        {PRIORITY_LABELS[task.priority]}
      </Badge>
      {task.due_date && (
        <span className={cn(
          'flex items-center gap-0.5 text-[10px] shrink-0 hidden sm:flex',
          isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
        )}>
          {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
          {formatDue(task.due_date)}
        </span>
      )}
    </div>
  )
}

// ── Recursive Tree Node ───────────────────────────────────────
function TreeNode({
  node,
  allNodes,
  tasks,
  depth,
  onTaskClick,
  onComplete,
  onNewTask,
  onEditNode,
  onAddChild,
}: {
  node: OrgNode
  allNodes: OrgNode[]
  tasks: Task[]
  depth: number
  onTaskClick: (t: Task) => void
  onComplete: (id: string) => Promise<boolean>
  onNewTask: (nodeId: string) => void
  onEditNode: (node: OrgNode) => void
  onAddChild: (parent: OrgNode) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)

  const children = allNodes
    .filter((n) => n.parent_id === node.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const nodeTasks = tasks.filter((t) => t.org_node_id === node.id)
  const openCount = nodeTasks.filter((t) => t.status !== 'done').length
  const hasContent = children.length > 0 || nodeTasks.length > 0

  // Count all tasks in subtree recursively for the badge
  function countSubtree(nId: string): { open: number; total: number } {
    const direct = tasks.filter((t) => t.org_node_id === nId)
    let open = direct.filter((t) => t.status !== 'done').length
    let total = direct.length
    allNodes.filter((n) => n.parent_id === nId).forEach((child) => {
      const sub = countSubtree(child.id)
      open += sub.open
      total += sub.total
    })
    return { open, total }
  }
  const subtree = countSubtree(node.id)

  // Root nodes (accounts) get a different visual treatment
  const isRoot = depth === 0

  return (
    <div className={cn(isRoot ? 'mb-1' : '')}>
      {/* Node header row */}
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md transition-colors group',
          isRoot
            ? 'px-3 py-2 font-semibold text-sm'
            : 'px-2 py-1.5 text-sm',
          hovered ? 'bg-muted/50' : '',
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => hasContent && setCollapsed((p) => !p)}
          className={cn(
            'shrink-0 text-muted-foreground hover:text-foreground transition-colors',
            !hasContent && 'invisible',
          )}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Color dot + type icon */}
        <span
          className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full text-white"
          style={{ backgroundColor: node.color }}
        >
          {TYPE_ICONS[node.type]}
        </span>

        {/* Name */}
        <span className={cn('flex-1 min-w-0 truncate', isRoot && 'font-semibold')}>
          {node.name}
        </span>

        {/* Task count badge */}
        {subtree.total > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {subtree.open > 0
              ? <span className="font-medium text-foreground">{subtree.open}</span>
              : '0'}
            /{subtree.total}
          </span>
        )}

        {/* Action buttons — visible on hover */}
        <div className={cn(
          'flex items-center gap-0.5 shrink-0 transition-opacity',
          hovered ? 'opacity-100' : 'opacity-0',
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Aufgabe hinzufügen"
            onClick={(e) => { e.stopPropagation(); onNewTask(node.id) }}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Unterbereich hinzufügen"
            onClick={(e) => { e.stopPropagation(); onAddChild(node) }}
          >
            <Layers className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Bearbeiten"
            onClick={(e) => { e.stopPropagation(); onEditNode(node) }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Children + tasks */}
      {!collapsed && (
        <div className={cn(
          'relative ml-4',
          hasContent && 'border-l-2 border-dashed border-muted pl-3 mt-0.5 pb-1',
        )}>
          {/* Direct tasks */}
          {nodeTasks.length > 0 && (
            <div className="space-y-0.5 mb-1">
              {nodeTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onTaskClick={onTaskClick}
                  onComplete={onComplete}
                />
              ))}
            </div>
          )}

          {/* Child nodes */}
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              allNodes={allNodes}
              tasks={tasks}
              depth={depth + 1}
              onTaskClick={onTaskClick}
              onComplete={onComplete}
              onNewTask={onNewTask}
              onEditNode={onEditNode}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Unassigned section ────────────────────────────────────────
function UnassignedSection({
  tasks,
  onTaskClick,
  onComplete,
}: {
  tasks: Task[]
  onTaskClick: (t: Task) => void
  onComplete: (id: string) => Promise<boolean>
}) {
  const [collapsed, setCollapsed] = useState(true)
  const unassigned = tasks.filter((t) => !t.org_node_id)
  if (unassigned.length === 0) return null

  return (
    <div className="mt-4 border-t pt-4">
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 text-sm text-muted-foreground"
        onClick={() => setCollapsed((p) => !p)}
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5" />
          : <ChevronDown className="h-3.5 w-3.5" />}
        <span>Ohne Bereich</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
          {unassigned.length}
        </Badge>
      </div>
      {!collapsed && (
        <div className="ml-6 mt-1 space-y-0.5">
          {unassigned.map((t) => (
            <TaskRow key={t.id} task={t} onTaskClick={onTaskClick} onComplete={onComplete} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main OrgTreeView ──────────────────────────────────────────
interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onComplete: (id: string) => Promise<boolean>
  onNewTaskWithNode: (nodeId: string) => void
}

export function OrgTreeView({ tasks, onTaskClick, onComplete, onNewTaskWithNode }: Props) {
  const { nodes, isLoading, createNode, updateNode, deleteNode } = useOrgNodes()

  const [nodeDialogOpen, setNodeDialogOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<OrgNode | null>(null)
  const [parentForNew, setParentForNew] = useState<OrgNode | null>(null)

  const rootNodes = nodes
    .filter((n) => !n.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const handleSaveNode = async (payload: Parameters<typeof createNode>[0]): Promise<boolean> => {
    if (editingNode) {
      return updateNode(editingNode.id, payload)
    }
    const result = await createNode(payload)
    return !!result
  }

  const openNewRoot = () => {
    setEditingNode(null)
    setParentForNew(null)
    setNodeDialogOpen(true)
  }

  const openEditNode = (node: OrgNode) => {
    setEditingNode(node)
    setParentForNew(null)
    setNodeDialogOpen(true)
  }

  const openAddChild = (parent: OrgNode) => {
    setEditingNode(null)
    setParentForNew(parent)
    setNodeDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {/* Add root node button */}
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" onClick={openNewRoot} className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Neuer Bereich
        </Button>
      </div>

      {rootNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3 text-2xl">
            🏢
          </div>
          <p className="text-sm text-muted-foreground">Noch keine Bereiche angelegt</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Klicke auf "Neuer Bereich" um loszulegen</p>
        </div>
      ) : (
        <div className="space-y-1">
          {rootNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              allNodes={nodes}
              tasks={tasks}
              depth={0}
              onTaskClick={onTaskClick}
              onComplete={onComplete}
              onNewTask={onNewTaskWithNode}
              onEditNode={openEditNode}
              onAddChild={openAddChild}
            />
          ))}
        </div>
      )}

      <UnassignedSection tasks={tasks} onTaskClick={onTaskClick} onComplete={onComplete} />

      <OrgNodeDialog
        open={nodeDialogOpen}
        node={editingNode}
        parentNode={parentForNew}
        onClose={() => { setNodeDialogOpen(false); setEditingNode(null); setParentForNew(null) }}
        onSave={handleSaveNode}
        onDelete={async (id) => { await deleteNode(id); return true }}
      />
    </div>
  )
}
