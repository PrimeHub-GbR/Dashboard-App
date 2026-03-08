"use client"

import { useMemo, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EditableCell } from "./EditableCell"
import type { Order, OrderSortField } from "@/lib/order-types"
import type { OrderSortState } from "@/hooks/useOrders"

interface OrderDataTableProps {
  orders: Order[]
  isLoading: boolean
  isAdmin: boolean
  getEditedValue: (orderId: string, field: keyof Order) => string | undefined
  isEdited: (orderId: string, field: keyof Order) => boolean
  onEdit: (
    orderId: string,
    field: keyof Order,
    originalValue: string | null,
    newValue: string
  ) => void
  sortState: OrderSortState
  onSortChange: (state: OrderSortState) => void
}

function formatCurrency(value: number | null): string {
  if (value === null) return "-"
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value)
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    Offen: "outline",
    "In Bearbeitung": "default",
    Versendet: "secondary",
    Abgeschlossen: "secondary",
    Storniert: "destructive",
  }
  return (
    <Badge variant={variants[status] ?? "outline"} className="text-xs whitespace-nowrap">
      {status}
    </Badge>
  )
}

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ArrowUp className="ml-1 h-3 w-3" />
  if (isSorted === "desc") return <ArrowDown className="ml-1 h-3 w-3" />
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
}

const SORTABLE_COLUMNS: Record<string, OrderSortField> = {
  supplier: "supplier",
  order_date: "order_date",
  status: "status",
  synced_at: "synced_at",
}

function formatDate(value: string | null): string {
  if (!value) return "-"
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function OrderDataTable({
  orders,
  isLoading,
  isAdmin,
  getEditedValue,
  isEdited,
  onEdit,
  sortState,
  onSortChange,
}: OrderDataTableProps) {
  const sorting: SortingState = useMemo(
    () => [{ id: sortState.field, desc: !sortState.ascending }],
    [sortState]
  )

  const handleSortingChange = useCallback(
    (updaterOrValue: SortingState | ((prev: SortingState) => SortingState)) => {
      const newSorting =
        typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue
      if (newSorting.length > 0) {
        const col = newSorting[0]
        const field = SORTABLE_COLUMNS[col.id]
        if (field) onSortChange({ field, ascending: !col.desc })
      }
    },
    [sorting, onSortChange]
  )

  const columns = useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: "supplier",
        header: "Lieferant",
        cell: ({ row }) => (
          <span className="font-medium whitespace-nowrap">{row.original.supplier ?? "-"}</span>
        ),
        size: 120,
      },
      {
        accessorKey: "order_date",
        header: "Bestelldatum",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-sm">
            {formatDate(row.original.order_date)}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "ean",
        header: "EAN",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.ean ?? "-"}</span>
        ),
        size: 140,
        enableSorting: false,
      },
      {
        accessorKey: "title",
        header: "Titel",
        cell: ({ row }) => (
          <span className="max-w-[300px] truncate block text-sm" title={row.original.title ?? ""}>
            {row.original.title ?? "-"}
          </span>
        ),
        size: 300,
        enableSorting: false,
      },
      {
        accessorKey: "cost",
        header: "Preis",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatCurrency(row.original.cost)}
          </span>
        ),
        size: 90,
        enableSorting: false,
      },
      {
        accessorKey: "quantity",
        header: "Menge",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.quantity ?? "-"}</span>
        ),
        size: 75,
        enableSorting: false,
      },
      {
        accessorKey: "total",
        header: "Gesamt",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums font-medium">
            {formatCurrency(row.original.total)}
          </span>
        ),
        size: 100,
        enableSorting: false,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const editedValue = getEditedValue(row.original.id, "status")
          const displayValue = editedValue ?? row.original.status ?? ""
          const edited = isEdited(row.original.id, "status")
          if (isAdmin) {
            return (
              <EditableCell
                orderId={row.original.id}
                field="status"
                value={row.original.status}
                displayValue={displayValue}
                isEdited={edited}
                isAdmin={isAdmin}
                onEdit={onEdit}
              />
            )
          }
          return <StatusBadge status={displayValue || null} />
        },
        size: 140,
      },
      {
        accessorKey: "notes",
        header: "Notizen",
        cell: ({ row }) => {
          const editedValue = getEditedValue(row.original.id, "notes")
          const displayValue = editedValue ?? row.original.notes ?? ""
          const edited = isEdited(row.original.id, "notes")
          if (isAdmin) {
            return (
              <EditableCell
                orderId={row.original.id}
                field="notes"
                value={row.original.notes}
                displayValue={displayValue}
                isEdited={edited}
                isAdmin={isAdmin}
                onEdit={onEdit}
              />
            )
          }
          return (
            <span className="max-w-[200px] truncate block text-sm">
              {displayValue || "-"}
            </span>
          )
        },
        size: 200,
        enableSorting: false,
      },
    ],
    [isAdmin, getEditedValue, isEdited, onEdit]
  )

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
  })

  const HEADER_LABELS = ["Lieferant", "Bestelldatum", "EAN", "Titel", "Preis", "Menge", "Gesamt", "Status", "Notizen"]

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {HEADER_LABELS.map((h, i) => <TableHead key={i}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: HEADER_LABELS.length }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                Keine Ergebnisse fuer die aktuelle Suche/Filter gefunden.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead
                  key={h.id}
                  className={h.column.getCanSort() ? "cursor-pointer select-none hover:bg-muted/50" : ""}
                  onClick={h.column.getToggleSortingHandler()}
                  style={{ width: h.getSize() }}
                  aria-sort={
                    h.column.getIsSorted() === "asc" ? "ascending"
                      : h.column.getIsSorted() === "desc" ? "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getCanSort() && <SortIcon isSorted={h.column.getIsSorted()} />}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/30">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
