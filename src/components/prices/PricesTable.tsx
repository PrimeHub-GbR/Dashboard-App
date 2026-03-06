"use client"

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { PriceEntry } from "@/lib/price-types"

const columns: ColumnDef<PriceEntry>[] = [
  {
    accessorKey: "ean",
    header: "EAN",
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">{String(getValue())}</span>
    ),
  },
  {
    accessorKey: "asin",
    header: "ASIN",
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="font-mono text-sm">{v ? String(v) : "–"}</span>
    },
  },
  {
    accessorKey: "ek_price",
    header: "EK-Preis (€)",
    cell: ({ getValue }) => {
      const v = getValue()
      if (v == null) return <span className="text-muted-foreground">–</span>
      return (
        <span className="tabular-nums">
          {Number(v).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
        </span>
      )
    },
  },
  {
    accessorKey: "supplier",
    header: "Lieferant",
    cell: ({ getValue }) => {
      const v = getValue()
      return v ? String(v) : <span className="text-muted-foreground">–</span>
    },
  },
  {
    accessorKey: "order_date",
    header: "Bestelldatum",
    cell: ({ getValue }) => {
      const v = getValue()
      if (!v) return <span className="text-muted-foreground">–</span>
      return new Date(String(v)).toLocaleDateString("de-DE")
    },
  },
]

const SKELETON_ROWS = 10

interface PricesTableProps {
  prices: PriceEntry[]
  isLoading: boolean
}

export function PricesTable({ prices, isLoading }: PricesTableProps) {
  const table = useReactTable({
    data: prices,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                Keine Einträge gefunden
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
