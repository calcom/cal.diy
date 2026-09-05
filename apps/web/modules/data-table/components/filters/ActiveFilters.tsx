"use client";

import { ColumnFilterType } from "@calcom/features/data-table/lib/types";
import type { Table } from "@tanstack/react-table";
import { useDataTable, useFilterableColumns } from "~/data-table/hooks";
import { DateRangeFilter } from "./DateRangeFilter";
import { FilterPopover } from "./FilterPopover";

// Add the new ActiveFilters component
interface ActiveFiltersProps<TData> {
  table: Table<TData>;
}

export function ActiveFilters<TData>({ table }: ActiveFiltersProps<TData>) {
  const { activeFilters } = useDataTable();
  const filterableColumns = useFilterableColumns(table);

  return (
    <>
      {activeFilters.map((filter) => {
        const column = filterableColumns.find((col) => col.id === filter.f);
        if (!column) {
          return null;
        }

        if (column.type === ColumnFilterType.DATE_RANGE) {
          return (
            <DateRangeFilter
              key={column.id}
              column={column}
              options={column.dateRangeOptions}
              showColumnName
              showClearButton
            />
          );
        } else {
          return <FilterPopover key={column.id} column={column} />;
        }
      })}
    </>
  );
}
