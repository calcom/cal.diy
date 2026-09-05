import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Tooltip } from "@calcom/ui/components/tooltip";

import { useDataTable } from "~/data-table/hooks/useDataTable";

export const ClearFiltersButton = () => {
  const { t } = useLocale();
  const { activeFilters, clearAll } = useDataTable();

  if (!activeFilters?.length) {
    return null;
  }

  return (
    <Tooltip content={t("clear_filters")}>
      <Button
        color="minimal"
        data-testid="clear-filters-button"
        target="_blank"
        rel="noreferrer"
        StartIcon="x"
        onClick={() => clearAll()}>
        {t("clear")}
      </Button>
    </Tooltip>
  );
};
