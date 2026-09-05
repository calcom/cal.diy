import { useMemo } from "react";

import { useDataTable } from "./useDataTable";

export const useDisplayedFilterCount = () => {
  const { activeFilters } = useDataTable();
  return useMemo(() => (activeFilters ?? []).length, [activeFilters]);
};
