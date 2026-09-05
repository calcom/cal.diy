"use client";

import type { SeparatorRow } from "@calcom/features/data-table/lib/separator";
import { isSeparatorRow } from "@calcom/features/data-table/lib/separator";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Command, CommandItem, CommandList } from "@calcom/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@calcom/ui/components/popover";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNew,
  TableRow,
} from "@calcom/ui/components/table";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronsUpDownIcon, EyeOffIcon } from "@coss/ui/icons";
import type { Header, HeaderGroup, Table as ReactTableType, Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/react-virtual";
import kebabCase from "lodash/kebabCase";
import { memo, useEffect, useMemo, useState } from "react";
import { useColumnResizing } from "~/data-table/hooks/useColumnResizing";
import { useColumnSizingVars } from "~/data-table/hooks/useColumnSizingVars";

export type DataTablePropsFromWrapper<TData> = {
  table: ReactTableType<TData>;
  tableContainerRef: React.RefObject<HTMLDivElement>;
  isPending?: boolean;
  variant?: "default" | "compact";
  testId?: string;
  bodyTestId?: string;
  children?: React.ReactNode;
  enableColumnResizing?: boolean;
  className?: string;
  containerClassName?: string;
  headerClassName?: string;
  rowClassName?: string | ((row: Row<TData>) => string);
  rowTestId?: string | ((row: Row<TData>) => string | undefined);
  rowDataAttributes?: (row: Row<TData>) => Record<string, string> | undefined;
  paginationMode?: "infinite" | "standard";
  hasWrapperContext?: boolean;
  hideSeparatorsOnSort?: boolean;
  hideSeparatorsOnFilter?: boolean;
  separatorClassName?: string;
};

export type DataTableProps<TData> = DataTablePropsFromWrapper<TData> & {
  onRowMouseclick?: (row: Row<TData>) => void;
  onScroll?: (e: Pick<React.UIEvent<HTMLDivElement, UIEvent>, "target">) => void;
  tableOverlay?: React.ReactNode;
  enableColumnResizing?: boolean;
};

export function DataTable<TData>({
  table,
  tableContainerRef,
  isPending,
  variant,
  onRowMouseclick,
  onScroll,
  children,
  enableColumnResizing,
  testId,
  bodyTestId,
  className,
  containerClassName,
  headerClassName,
  rowClassName,
  rowTestId,
  rowDataAttributes,
  paginationMode = "infinite",
  hasWrapperContext = false,
  hideSeparatorsOnSort = true,
  hideSeparatorsOnFilter = false,
  separatorClassName,
  ...rest
}: DataTableProps<TData> & React.ComponentPropsWithoutRef<"div">) {
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 100,
    getScrollElement: () => tableContainerRef.current,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 10,
  });

  const virtualItemsCount = rowVirtualizer.getVirtualItems().length;

  useEffect(() => {
    if (paginationMode === "infinite" && virtualItemsCount >= rows.length && tableContainerRef.current) {
      const target = tableContainerRef.current;
      // Right after the last row is rendered, tableContainer's scrollHeight is
      // temporarily larger than the actual height of the table, so we need to
      // wait for a short time before calling onScroll to ensure the scrollHeight
      // is correct.
      setTimeout(() => {
        onScroll?.({ target });
      }, 100);
    }
  }, [virtualItemsCount, rows.length, tableContainerRef.current, paginationMode, onScroll]);

  const columnSizingVars = useColumnSizingVars({ table });

  useColumnResizing({
    enabled: Boolean(enableColumnResizing),
    table,
    tableContainerRef,
  });

  return (
    <div
      className={classNames(
        !hasWrapperContext ? "grid" : "bg-cal-muted grid rounded-xl px-0.5 pb-0.5",
        className
      )}
      style={{
        gridTemplateRows: "auto 1fr auto",
        gridTemplateAreas: "'header' 'body' 'footer'",
        ...rest.style,
      }}
      data-testid={testId ?? "data-table"}>
      {/*
        Invalidate left & right properties for <= sm screen size,
        because we pin columns only for >= sm screen sizes.
      */}
      <style jsx global>{`
        @media (max-width: 640px) {
          .data-table th,
          .data-table td {
            left: initial !important;
            right: initial !important;
          }
        }
      `}</style>
      <div
        ref={tableContainerRef}
        onScroll={onScroll}
        className={classNames(
          "relative overflow-auto",
          "scrollbar-thin relative rounded-md ",
          paginationMode === "infinite" && "h-[80dvh]", // Set a fixed height for the container
          containerClassName
        )}
        style={{ gridArea: "body" }}>
        <TableNew
          className={classNames(
            "data-table grid border-0",
            !hasWrapperContext && "bg-cal-muted rounded-xl px-0.5 pb-0.5"
          )}
          style={{
            ...columnSizingVars,
            ...(Boolean(enableColumnResizing) && { width: table.getTotalSize() }),
          }}>
          <TableHeader className={classNames("sticky top-0 z-10", headerClassName)}>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => (
              <TableRow key={headerGroup.id} className="hover:bg-subtle flex w-full border-none">
                {headerGroup.headers.map((header: Header<TData, unknown>) => {
                  const { column } = header;
                  return (
                    <TableHead
                      key={header.id}
                      style={{
                        ...(column.getIsPinned() === "left" && { left: `${column.getStart("left")}px` }),
                        ...(column.getIsPinned() === "right" && { right: `${column.getStart("right")}px` }),
                        width: `var(--header-${kebabCase(header?.id)}-size)`,
                      }}
                      className={classNames(
                        "relative flex items-center",
                        column.columnDef.meta?.autoWidth ? "grow" : "shrink-0",
                        "bg-cal-muted",
                        column.getIsPinned() && "top-0 z-20 sm:sticky"
                      )}>
                      <TableHeadLabel header={header} />
                      {Boolean(enableColumnResizing) && header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={classNames(
                            "group absolute right-0 top-0 h-full w-[5px] cursor-col-resize touch-none select-none opacity-0 hover:opacity-50",
                            header.column.getIsResizing() && "opacity-75!"
                          )}>
                          <div className="bg-inverted mx-auto h-full w-px" />
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          {/* When resizing any column we will render this special memoized version of our table body */}
          {table.getState().columnSizingInfo.isResizingColumn ? (
            <MemoizedTableBody
              table={table}
              rowVirtualizer={rowVirtualizer}
              rows={rows}
              testId={bodyTestId}
              variant={variant}
              isPending={isPending}
              onRowMouseclick={onRowMouseclick}
              paginationMode={paginationMode}
              rowClassName={rowClassName}
              rowTestId={rowTestId}
              rowDataAttributes={rowDataAttributes}
              hideSeparatorsOnSort={hideSeparatorsOnSort}
              hideSeparatorsOnFilter={hideSeparatorsOnFilter}
              separatorClassName={separatorClassName}
              tableContainerRef={tableContainerRef}
            />
          ) : (
            <DataTableBody
              table={table}
              rowVirtualizer={rowVirtualizer}
              rows={rows}
              testId={bodyTestId}
              variant={variant}
              isPending={isPending}
              onRowMouseclick={onRowMouseclick}
              paginationMode={paginationMode}
              rowClassName={rowClassName}
              rowTestId={rowTestId}
              rowDataAttributes={rowDataAttributes}
              hideSeparatorsOnSort={hideSeparatorsOnSort}
              hideSeparatorsOnFilter={hideSeparatorsOnFilter}
              separatorClassName={separatorClassName}
              tableContainerRef={tableContainerRef}
            />
          )}
        </TableNew>
      </div>
      {children}
    </div>
  );
}

const MemoizedTableBody = memo(
  DataTableBody,
  (prev, next) =>
    prev.table.options.data === next.table.options.data &&
    prev.rowVirtualizer === next.rowVirtualizer &&
    prev.rows === next.rows &&
    prev.testId === next.testId &&
    prev.variant === next.variant &&
    prev.isPending === next.isPending &&
    prev.onRowMouseclick === next.onRowMouseclick &&
    prev.paginationMode === next.paginationMode &&
    prev.rowClassName === next.rowClassName &&
    prev.rowTestId === next.rowTestId &&
    prev.rowDataAttributes === next.rowDataAttributes &&
    prev.hideSeparatorsOnSort === next.hideSeparatorsOnSort &&
    prev.hideSeparatorsOnFilter === next.hideSeparatorsOnFilter &&
    prev.separatorClassName === next.separatorClassName &&
    prev.tableContainerRef === next.tableContainerRef
) as typeof DataTableBody;

type DataTableBodyProps<TData> = {
  table: ReactTableType<TData>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  rows: Row<TData>[];
  testId?: string;
  variant?: "default" | "compact";
  isPending?: boolean;
  onRowMouseclick?: (row: Row<TData>) => void;
  paginationMode?: "infinite" | "standard";
  rowClassName?: string | ((row: Row<TData>) => string);
  rowTestId?: string | ((row: Row<TData>) => string | undefined);
  rowDataAttributes?: (row: Row<TData>) => Record<string, string> | undefined;
  hideSeparatorsOnSort?: boolean;
  hideSeparatorsOnFilter?: boolean;
  separatorClassName?: string;
  tableContainerRef: React.RefObject<HTMLDivElement>;
};

type RowToRender<TData> = {
  row: Row<TData>;
  virtualItem?: VirtualItem;
};

function SeparatorRowRenderer({
  separator,
  className,
  colSpan,
}: {
  separator: SeparatorRow;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={classNames(
        "bg-cal-muted text-emphasis w-full px-3 py-2 font-semibold",
        separator.className,
        className
      )}>
      {separator.label}
    </td>
  );
}

function DataTableBody<TData>({
  table,
  rowVirtualizer: _rowVirtualizer,
  rows,
  testId,
  variant,
  isPending,
  onRowMouseclick,
  paginationMode,
  rowClassName,
  rowTestId,
  rowDataAttributes,
  hideSeparatorsOnSort = true,
  hideSeparatorsOnFilter = false,
  separatorClassName,
  tableContainerRef,
}: DataTableBodyProps<TData> & { paginationMode?: "infinite" | "standard" }) {
  const { t } = useLocale();

  const hasActiveSorting = table.getState().sorting.length > 0;
  const hasActiveFilters = table.getState().columnFilters.length > 0;

  const filteredRows = useMemo(() => {
    if ((hideSeparatorsOnSort && hasActiveSorting) || (hideSeparatorsOnFilter && hasActiveFilters)) {
      return rows.filter((row) => !isSeparatorRow(row.original));
    }
    return rows;
  }, [rows, hideSeparatorsOnSort, hideSeparatorsOnFilter, hasActiveSorting, hasActiveFilters]);

  const filteredRowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    estimateSize: () => 100,
    getScrollElement: () => tableContainerRef.current,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 10,
  });

  const virtualItems = filteredRowVirtualizer.getVirtualItems();
  const tableHeight = paginationMode === "infinite" ? filteredRowVirtualizer.getTotalSize() : "auto";

  const rowsToRender = useMemo<RowToRender<TData>[]>(() => {
    return paginationMode === "infinite"
      ? virtualItems.map((virtualItem) => ({
          row: filteredRows[virtualItem.index] as Row<TData>,
          virtualItem,
        }))
      : filteredRows.map((row) => ({ row }));
  }, [paginationMode, virtualItems, filteredRows]);

  if (!isPending && rowsToRender.length === 0) {
    return (
      <TableBody className="relative grid" data-testid={testId} style={{ height: tableHeight }}>
        <TableRow>
          <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
            {t("no_results")}
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody
      className="border-muted relative grid border-t"
      data-testid={testId}
      style={{ height: tableHeight }}>
      {rowsToRender.map(({ row, virtualItem }) => {
        const isSeparator = isSeparatorRow(row.original);

        if (isSeparator) {
          return (
            <TableRow
              ref={virtualItem ? (node) => filteredRowVirtualizer.measureElement(node) : undefined}
              key={row.id}
              data-index={virtualItem?.index}
              style={{
                display: "flex",
                width: "100%",
                ...(virtualItem && {
                  position: "absolute",
                  transform: `translateY(${virtualItem.start}px)`,
                }),
              }}
              className="hover:bg-subtle border-muted flex w-full border-b">
              <SeparatorRowRenderer
                separator={row.original as SeparatorRow}
                className={separatorClassName}
                colSpan={table.getAllColumns().length}
              />
            </TableRow>
          );
        }

        const computedRowTestId = typeof rowTestId === "function" ? rowTestId(row) : rowTestId;
        const computedRowClassName = typeof rowClassName === "function" ? rowClassName(row) : rowClassName;
        const computedDataAttributes = rowDataAttributes?.(row);

        return (
          <TableRow
            ref={virtualItem ? (node) => filteredRowVirtualizer.measureElement(node) : undefined}
            key={row.id}
            data-testid={computedRowTestId}
            {...computedDataAttributes}
            data-index={virtualItem?.index} // needed for dynamic row height measurement
            data-state={row.getIsSelected() && "selected"}
            onClick={(e) => {
              if (!onRowMouseclick) return;
              const target = e.target as Node | null;
              const current = e.currentTarget as HTMLElement | null;
              // Only invoke the handler when the event target is inside the row element.
              if (!target || !current || !current.contains(target)) return;
              onRowMouseclick(row);
            }}
            style={{
              display: "flex",
              ...(virtualItem && {
                position: "absolute",
                transform: `translateY(${virtualItem.start}px)`,
                width: "100%",
              }),
            }}
            className={classNames(onRowMouseclick && "hover:cursor-pointer", "group", computedRowClassName)}>
            {row.getVisibleCells().map((cell) => {
              const column = cell.column;
              return (
                <TableCell
                  key={cell.id}
                  data-testid={`data-table-td-${cell.column.id}`}
                  style={{
                    ...(column.getIsPinned() === "left" && { left: `${column.getStart("left")}px` }),
                    ...(column.getIsPinned() === "right" && { right: `${column.getStart("right")}px` }),
                    width: `var(--col-${kebabCase(cell.column.id)}-size)`,
                  }}
                  className={classNames(
                    "bg-default group-hover:!bg-cal-muted group-data-[state=selected]:bg-subtle flex shrink-0 items-center overflow-hidden",
                    variant === "compact" && "p-0",
                    column.getIsPinned() &&
                      "bg-default group-hover:!bg-cal-muted group-data-[state=selected]:bg-subtle sm:sticky"
                  )}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        );
      })}
    </TableBody>
  );
}

const TableHeadLabel = <TData,>({ header }: { header: Header<TData, unknown> }) => {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();

  const canHide = header.column.getCanHide();
  const canSort = header.column.getCanSort();

  if (!canSort && !canHide) {
    if (typeof header.column.columnDef.header === "string") {
      return (
        <div className="truncate" title={header.column.columnDef.header}>
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      );
    } else {
      return header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={classNames(
            "group mr-1 flex w-full items-center gap-2 rounded-md px-2 py-1",
            open && "bg-cal-muted"
          )}>
          <div
            className="text-default truncate text-sm leading-none"
            title={
              typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : undefined
            }>
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </div>
          {header.column.getIsSorted() === "asc" && <ArrowUpIcon className="h-4 w-4 shrink-0" />}
          {header.column.getIsSorted() === "desc" && <ArrowDownIcon className="h-4 w-4 shrink-0" />}
          <div className="grow" />
          <ChevronsUpDownIcon
            className={classNames(
              "text-subtle h-4 w-4 shrink-0",
              !open && "opacity-0 group-hover:opacity-100"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-32 p-0">
        <Command>
          <CommandList>
            {canSort && (
              <>
                <CommandItem
                  className="flex cursor-pointer items-center gap-2 px-3 py-2"
                  onSelect={() => {
                    if (header.column.getIsSorted() === "asc") {
                      header.column.clearSorting();
                    } else {
                      header.column.toggleSorting(false, true);
                    }
                  }}>
                  <ArrowUpIcon className="h-4 w-4" />
                  {t("asc")}
                  <div className="flex-1" />
                  {header.column.getIsSorted() === "asc" && <CheckIcon className="h-4 w-4" />}
                </CommandItem>
                <CommandItem
                  className="flex cursor-pointer items-center gap-2 px-3 py-2"
                  onSelect={() => {
                    if (header.column.getIsSorted() === "desc") {
                      header.column.clearSorting();
                    } else {
                      header.column.toggleSorting(true, true);
                    }
                  }}>
                  <ArrowDownIcon className="h-4 w-4" />
                  {t("desc")}
                  <div className="flex-1" />
                  {header.column.getIsSorted() === "desc" && <CheckIcon className="h-4 w-4" />}
                </CommandItem>
              </>
            )}
            {canHide && (
              <CommandItem
                className="flex cursor-pointer items-center gap-2 px-3 py-2"
                onSelect={() => {
                  header.column.toggleVisibility(false);
                  setOpen(false);
                }}>
                <EyeOffIcon className="h-4 w-4" />
                {t("hide")}
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
