'use client'

import { useCallback, useEffect, useState } from 'react'

export type OrgNodeType = 'account' | 'store' | 'category' | 'product' | 'node'

export interface OrgNode {
  id: string
  parent_id: string | null
  name: string
  type: OrgNodeType
  sort_order: number
  color: string
}

export interface CreateOrgNodePayload {
  parent_id?: string | null
  name: string
  type: OrgNodeType
  sort_order?: number
  color?: string
}

/** Builds a flat list with indented labels for use in <select> dropdowns */
export function buildFlatList(nodes: OrgNode[]): { id: string; label: string; depth: number }[] {
  const childrenMap = new Map<string | null, OrgNode[]>()
  nodes.forEach((n) => {
    const key = n.parent_id ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(n)
  })

  const result: { id: string; label: string; depth: number }[] = []

  function walk(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) ?? []
    children.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    for (const node of children) {
      result.push({ id: node.id, label: node.name, depth })
      walk(node.id, depth + 1)
    }
  }

  walk(null, 0)
  return result
}

export function useOrgNodes() {
  const [nodes, setNodes] = useState<OrgNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/org-nodes')
      if (!res.ok) throw new Error('Fehler beim Laden')
      const json = await res.json()
      setNodes(json.nodes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createNode = async (payload: CreateOrgNodePayload): Promise<OrgNode | null> => {
    try {
      const res = await fetch('/api/org-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return null
      const json = await res.json()
      await load()
      return json.node
    } catch {
      return null
    }
  }

  const updateNode = async (id: string, payload: Partial<CreateOrgNodePayload>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/org-nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return false
      await load()
      return true
    } catch {
      return false
    }
  }

  const deleteNode = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/org-nodes/${id}`, { method: 'DELETE' })
      if (!res.ok) return false
      setNodes((prev) => prev.filter((n) => n.id !== id))
      return true
    } catch {
      return false
    }
  }

  return { nodes, isLoading, error, refresh: load, createNode, updateNode, deleteNode }
}
