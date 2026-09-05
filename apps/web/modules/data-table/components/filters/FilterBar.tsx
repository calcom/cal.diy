"use client";

import type { Table } from "@tanstack/react-table";
import { useDisplayedFilterCount } from "~/data-table/hooks";
import { ActiveFilters } from "./ActiveFilters";
import { AddFilterButton } from "./AddFilterButton";

interface FilterBarProps<TData> {
  table: Table<TData>;
}

export function FilterBar<TData>({ table }: FilterBarProps<TData>) {
  const displayedFilterCount = useDisplayedFilterCount();

  return (
    <>
      {displayedFilterCount === 0 && <AddFilterButton table={table} />}
      <ActiveFilters table={table} />
      {displayedFilterCount > 0 && <AddFilterButton table={table} variant="minimal" />}
    </>
  );
}
