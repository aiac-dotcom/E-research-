import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { CSVLink } from "react-csv";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  filename?: string;
  searchPlaceholder?: string;
}

export function DataTable<T>({ data, columns, loading, filename = "export.csv", searchPlaceholder = "Search..." }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  if (loading) {
    return (
      <div className="space-y-4 w-full">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-[250px]" />
          <Skeleton className="h-9 w-[100px]" />
        </div>
        <div className="rounded-md border">
          <div className="h-12 border-b bg-muted/20" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 border-b px-4 py-3 flex items-center gap-4">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const exportData = table.getFilteredRowModel().rows.map(row => row.original);

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        
        {exportData.length > 0 && (
          <CSVLink 
            data={exportData as any} 
            filename={filename} 
            className="print:hidden flex items-center justify-center gap-2 px-3 h-9 rounded-md border bg-background hover:bg-muted transition-colors text-sm font-medium" 
            aria-label="Export table data as CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </CSVLink>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                      key={header.id} 
                      onClick={header.column.getToggleSortingHandler()} 
                      className={`cursor-pointer select-none whitespace-nowrap h-11 ${header.column.getCanSort() ? 'hover:bg-muted/80' : ''}`}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="w-4 h-4 inline-flex items-center justify-center text-[10px]">
                          {{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? null}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3 text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                    No matching results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}</span> to{" "}
            <span className="font-medium text-foreground">{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}</span>{" "}
            of <span className="font-medium text-foreground">{table.getFilteredRowModel().rows.length}</span> results
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
