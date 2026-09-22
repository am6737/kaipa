import { useEffect, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTableBulkActions, DataTablePagination, DataTableToolbar } from '@/components/data-table'

type AdminDataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  entityName: string
  searchPlaceholder: string
  pageSize?: number
  bulkActions?: React.ReactNode
  renderBulkActions?: (selection: {
    rows: TData[]
    resetSelection: () => void
  }) => React.ReactNode
  onBulkDelete?: (rows: TData[]) => void | Promise<void>
  className?: string
}

export function selectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-0.5'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-0.5'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }
}

export function AdminDataTable<TData>({
  data,
  columns,
  entityName,
  searchPlaceholder,
  pageSize = 10,
  bulkActions,
  renderBulkActions,
  onBulkDelete,
  className,
}: AdminDataTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection, globalFilter, pagination },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [globalFilter, data.length])

  const defaultBulkActions = (
    <>
      <Button
        variant='outline'
        size='icon'
        className='size-8'
        title='导出选中项'
        aria-label='导出选中项'
        onClick={() => {
          const rows = table.getFilteredSelectedRowModel().rows.map((row) => row.original)
          const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `${entityName}-selected.json`
          anchor.click()
          URL.revokeObjectURL(url)
          table.resetRowSelection()
        }}
      >
        <Download />
      </Button>
      {onBulkDelete && (
        <Button
          variant='destructive'
          size='icon'
          className='size-8'
          title='删除选中项'
          aria-label='删除选中项'
          onClick={async () => {
            await onBulkDelete(table.getFilteredSelectedRowModel().rows.map((row) => row.original))
            table.resetRowSelection()
          }}
        >
          <Trash2 />
        </Button>
      )}
    </>
  )
  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  const renderedBulkActions = renderBulkActions
    ? renderBulkActions({
        rows: selectedRows,
        resetSelection: () => table.resetRowSelection(),
      })
    : bulkActions ?? defaultBulkActions

  return (
    <div className={cn('flex flex-1 flex-col gap-4', className)}>
      <DataTableToolbar table={table} searchPlaceholder={searchPlaceholder} />
      <div className='overflow-hidden rounded-md border'>
        <Table className='min-w-xl'>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={cn(header.column.columnDef.meta?.className, header.column.columnDef.meta?.thClassName)}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.className, cell.column.columnDef.meta?.tdClassName)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className='h-24 text-center'>暂无数据</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='mt-auto' />
      <DataTableBulkActions table={table} entityName={entityName}>{renderedBulkActions}</DataTableBulkActions>
    </div>
  )
}
