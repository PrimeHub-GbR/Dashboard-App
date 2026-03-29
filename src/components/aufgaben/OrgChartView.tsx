'use client'

import { useState } from 'react'
import { Tree, TreeNode } from 'react-organizational-chart'
import { OrgNode, useOrgNodes } from '@/hooks/useOrgNodes'
import { Task } from '@/hooks/useAufgaben'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Plus, Pencil, ChevronDown, ChevronRight, Layers,
  Building2, Store, FolderOpen, Package, AlertTriangle, Calendar,
} from 'lucide-react'
import { OrgNodeDialog } from './OrgNodeDialog'

// ── Helpers ───────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  account: 'Seller Account',
  store: 'Store',
  category: 'Kategorie',
  product: 'Produkt',
  node: 'Bereich',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  account:  <Building2 className="h-4 w-4" />,
  store:    <Store className="h-4 w-4" />,
  category: <FolderOpen className="h-4 w-4" />,
  product:  <Package className="h-4 w-4" />,
  node:     <Layers className="h-4 w-4" />,
}

const STATUS_STYLES: Record<string, string> = {
  todo:        'text-gray-600 bg-gray-100',
  in_progress: 'text-blue-700 bg-blue-50',
  in_review:   'text-purple-700 bg-purple-50',
  done:        'text-green-700 bg-green-50',
  blocked:     'text-red-700 bg-red-50',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'Offen', in_progress: 'In Arbeit', in_review: 'Review',
  done: 'Erledigt', blocked: 'Blockiert',
}

// ── Recursive task counter ────────────────────────────────────
function countSubtree(nodeId: string, allNodes: OrgNode[], tasks: Task[]) {
  const direct = tasks.filter((t) => t.org_node_id === nodeId)
  let open = direct.filter((t) => t.status !== 'done').length
  let total = direct.length
  allNodes.filter((n) => n.parent_id === nodeId).forEach((child) => {
    const sub = countSubtree(child.id, allNodes, tasks)
    open += sub.open
    total += sub.total
  })
  return { open, total }
}

// ── Node Card ─────────────────────────────────────────────────
function NodeCard({
  node,
  allNodes,
  tasks,
  collapsed,
  hasChildren,
  onToggle,
  onNewTask,
  onEditNode,
  onAddChild,
  onSelectNode,
  isSelected,
}: {
  node: OrgNode
  allNodes: OrgNode[]
  tasks: Task[]
  collapsed: boolean
  hasChildren: boolean
  onToggle: () => void
  onNewTask: (id: string) => void
  onEditNode: (node: OrgNode) => void
  onAddChild: (node: OrgNode) => void
  onSelectNode: (node: OrgNode) => void
  isSelected: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const { open, total } = countSubtree(node.id, allNodes, tasks)
  const directTasks = tasks.filter((t) => t.org_node_id === node.id)

  return (
    <div
      className="inline-block text-left"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card */}
      <div
        className={cn(
          'relative rounded-xl border bg-card shadow-sm transition-all duration-200 cursor-pointer select-none',
          'min-w-[160px] max-w-[200px]',
          isSelected
            ? 'ring-2 shadow-md'
            : 'hover:shadow-md hover:-translate-y-0.5',
        )}
        style={{
          borderTopWidth: '3px',
          borderTopColor: node.color,
          ...(isSelected ? { ringColor: node.color } : {}),
        }}
        onClick={() => onSelectNode(node)}
      >
        <div className="p-3 space-y-1.5">
          {/* Type + Icon */}
          <div className="flex items-center gap-1.5" style={{ color: node.color }}>
            {TYPE_ICONS[node.type]}
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {TYPE_LABELS[node.type]}
            </span>
          </div>

          {/* Name */}
          <p className="font-semibold text-sm leading-tight text-foreground">
            {node.name}
          </p>

          {/* Counters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {total > 0 && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                open > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
              )}>
                {open > 0 ? `${open} offen` : `${total} ✓`}
              </span>
            )}
            {directTasks.length > 0 && total !== directTasks.length && (
              <span className="text-[10px] text-muted-foreground">
                +{directTasks.length} direkt
              </span>
            )}
          </div>
        </div>

        {/* Collapse toggle */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-background border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            {collapsed
              ? <ChevronRight className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </button>
        )}

        {/* Hover actions */}
        {hovered && (
          <div
            className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-background rounded-lg border shadow-md px-1 py-0.5 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              title="Aufgabe hinzufügen"
              onClick={() => onNewTask(node.id)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              title="Unterbereich"
              onClick={() => onAddChild(node)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Layers className="h-3 w-3" />
            </button>
            <button
              title="Bearbeiten"
              onClick={() => onEditNode(node)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Recursive TreeNode builder ────────────────────────────────
function buildTreeNode({
  node,
  allNodes,
  tasks,
  collapsedIds,
  onToggle,
  onNewTask,
  onEditNode,
  onAddChild,
  onSelectNode,
  selectedNodeId,
}: {
  node: OrgNode
  allNodes: OrgNode[]
  tasks: Task[]
  collapsedIds: Set<string>
  onToggle: (id: string) => void
  onNewTask: (id: string) => void
  onEditNode: (node: OrgNode) => void
  onAddChild: (node: OrgNode) => void
  onSelectNode: (node: OrgNode) => void
  selectedNodeId: string | null
}): React.ReactNode {
  const children = allNodes
    .filter((n) => n.parent_id === node.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const collapsed = collapsedIds.has(node.id)

  const card = (
    <NodeCard
      node={node}
      allNodes={allNodes}
      tasks={tasks}
      collapsed={collapsed}
      hasChildren={children.length > 0}
      onToggle={() => onToggle(node.id)}
      onNewTask={onNewTask}
      onEditNode={onEditNode}
      onAddChild={onAddChild}
      onSelectNode={onSelectNode}
      isSelected={selectedNodeId === node.id}
    />
  )

  if (collapsed || children.length === 0) {
    return <TreeNode key={node.id} label={card} />
  }

  return (
    <TreeNode key={node.id} label={card}>
      {children.map((child) =>
        buildTreeNode({
          node: child, allNodes, tasks, collapsedIds,
          onToggle, onNewTask, onEditNode, onAddChild, onSelectNode, selectedNodeId,
        })
      )}
    </TreeNode>
  )
}

// ── Task Panel (selected node) ────────────────────────────────
function TaskPanel({
  node,
  tasks,
  onTaskClick,
  onComplete,
}: {
  node: OrgNode
  tasks: Task[]
  onTaskClick: (t: Task) => void
  onComplete: (id: string) => Promise<boolean>
}) {
  const nodeTasks = tasks.filter((t) => t.org_node_id === node.id)
  const today = new Date().toISOString().split('T')[0]

  if (nodeTasks.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Keine Aufgaben direkt in</span>
        <span className="font-medium text-foreground">{node.name}</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Aufgaben in {node.name}
      </p>
      <div className="rounded-lg border divide-y">
        {nodeTasks.map((task) => {
          const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
          const isDone = task.status === 'done'
          return (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors',
                isOverdue && !isDone && 'bg-red-50/60'
              )}
              onClick={() => onTaskClick(task)}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={async (e) => { if (e.target.checked && !isDone) await onComplete(task.id) }}
                onClick={(e) => e.stopPropagation()}
                className="h-3.5 w-3.5 shrink-0 rounded"
              />
              <span className={cn('flex-1 text-sm min-w-0 truncate', isDone && 'line-through text-muted-foreground')}>
                {task.title}
              </span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', STATUS_STYLES[task.status])}>
                {STATUS_LABELS[task.status]}
              </span>
              {task.due_date && (
                <span className={cn('flex items-center gap-0.5 text-[10px] shrink-0', isOverdue ? 'text-red-600' : 'text-muted-foreground')}>
                  {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
                  {new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main OrgChartView ─────────────────────────────────────────
interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onComplete: (id: string) => Promise<boolean>
  onNewTaskWithNode: (nodeId: string) => void
}

export function OrgChartView({ tasks, onTaskClick, onComplete, onNewTaskWithNode }: Props) {
  const { nodes, isLoading, createNode, updateNode, deleteNode } = useOrgNodes()

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null)
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<OrgNode | null>(null)
  const [parentForNew, setParentForNew] = useState<OrgNode | null>(null)

  const rootNodes = nodes
    .filter((n) => !n.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSaveNode = async (payload: Parameters<typeof createNode>[0]): Promise<boolean> => {
    if (editingNode) return updateNode(editingNode.id, payload)
    return !!(await createNode(payload))
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="space-y-3 w-full max-w-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (rootNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4 text-3xl">🏢</div>
        <p className="text-sm text-muted-foreground">Noch keine Bereiche angelegt</p>
        <Button
          className="mt-4 gap-1.5"
          size="sm"
          onClick={() => { setEditingNode(null); setParentForNew(null); setNodeDialogOpen(true) }}
        >
          <Plus className="h-4 w-4" /> Ersten Bereich anlegen
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => { setEditingNode(null); setParentForNew(null); setNodeDialogOpen(true) }}
        >
          <Plus className="h-3.5 w-3.5" /> Neuer Bereich
        </Button>
      </div>

      {/* Org Chart - horizontal scroll container */}
      <div className="overflow-x-auto pb-6">
        <div className="flex gap-8 justify-start min-w-max px-4">
          {rootNodes.map((root) => (
            <div key={root.id} className="pt-4">
              <Tree
                label={
                  <NodeCard
                    node={root}
                    allNodes={nodes}
                    tasks={tasks}
                    collapsed={collapsedIds.has(root.id)}
                    hasChildren={nodes.some((n) => n.parent_id === root.id)}
                    onToggle={() => toggleCollapse(root.id)}
                    onNewTask={onNewTaskWithNode}
                    onEditNode={(n) => { setEditingNode(n); setParentForNew(null); setNodeDialogOpen(true) }}
                    onAddChild={(n) => { setEditingNode(null); setParentForNew(n); setNodeDialogOpen(true) }}
                    onSelectNode={setSelectedNode}
                    isSelected={selectedNode?.id === root.id}
                  />
                }
                lineWidth="2px"
                lineColor="#e2e8f0"
                lineBorderRadius="6px"
              >
                {!collapsedIds.has(root.id) &&
                  nodes
                    .filter((n) => n.parent_id === root.id)
                    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                    .map((child) =>
                      buildTreeNode({
                        node: child,
                        allNodes: nodes,
                        tasks,
                        collapsedIds,
                        onToggle: toggleCollapse,
                        onNewTask: onNewTaskWithNode,
                        onEditNode: (n) => { setEditingNode(n); setParentForNew(null); setNodeDialogOpen(true) },
                        onAddChild: (n) => { setEditingNode(null); setParentForNew(n); setNodeDialogOpen(true) },
                        onSelectNode: setSelectedNode,
                        selectedNodeId: selectedNode?.id ?? null,
                      })
                    )
                }
              </Tree>
            </div>
          ))}
        </div>
      </div>

      {/* Selected node task panel */}
      {selectedNode && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <TaskPanel
            node={selectedNode}
            tasks={tasks}
            onTaskClick={onTaskClick}
            onComplete={onComplete}
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-3 gap-1.5 text-xs"
            onClick={() => onNewTaskWithNode(selectedNode.id)}
          >
            <Plus className="h-3 w-3" /> Aufgabe in {selectedNode.name}
          </Button>
        </div>
      )}

      {/* Node Dialog */}
      <OrgNodeDialog
        open={nodeDialogOpen}
        node={editingNode}
        parentNode={parentForNew}
        onClose={() => { setNodeDialogOpen(false); setEditingNode(null); setParentForNew(null) }}
        onSave={handleSaveNode}
        onDelete={async (id) => { await deleteNode(id); if (selectedNode?.id === id) setSelectedNode(null); return true }}
      />
    </div>
  )
}
