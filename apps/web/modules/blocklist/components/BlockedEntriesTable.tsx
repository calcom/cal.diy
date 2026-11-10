"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { DataTableSelectionBar, DataTableWrapper } from "@calcom/web/modules/data-table/components";
import { IS_CALCOM } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";

import type { BlocklistEntry, BlocklistPermissions, BlocklistScope } from "@calcom/features/blocklist/types";
import { useBlockedEntriesColumns } from "./BlockedEntriesColumns";
import { BlocklistEntryDetailsSheet } from "./BlocklistEntryDetailsSheet";

export interface BlockedEntriesTableProps<T extends BlocklistEntry> {
  scope: BlocklistScope;
  data: T[];
  totalRowCount: number;
  isPending: boolean;
  limit: number;
  searchTerm?: string;
  permissions?: BlocklistPermissions;
  onAddClick: () => void;
  onDelete: (entry: T) => void;
  isDeleting?: boolean;
  detailsQuery?: {
    data?: {
      entry: {
        id: string;
        value: string;
        type: import("@calcom/prisma/enums").WatchlistType;
        description: string | null;
        source?: string;
        bookingReports?: Array<{ booking: { uid: string; title: string | null } }>;
      };
      auditHistory: Array<{
        id: string;
        value: string;
        changedAt: Date | string;
        changedByUser?: { name: string | null; email: string } | null;
      }>;
    };
    isLoading: boolean;
  };
  selectedEntryId?: string;
  onSelectEntry?: (id: string | null) => void;
  enableRowSelection?: boolean;
  renderBulkActions?: (selectedEntries: T[], clearSelection: () => void) => ReactNode;
}

export function BlockedEntriesTable<T extends BlocklistEntry>({
  scope,
  data,
  totalRowCount,
  isPending,
  limit,
  searchTerm,
  permissions,
  onAddClick,
  onDelete,
  isDeleting = false,
  detailsQuery,
  selectedEntryId,
  onSelectEntry,
  enableRowSelection = false,
  renderBulkActions,
}: BlockedEntriesTableProps<T>) {
  const { t } = useLocale();
  const isSystem = scope === "system";

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<T | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<T | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleViewDetails = (entry: T) => {
    setSelectedEntry(entry);
    setShowDetailsSheet(true);
    onSelectEntry?.(entry.id);
  };

  const handleDelete = (entry: T) => {
    setEntryToDelete(entry);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (entryToDelete) {
      onDelete(entryToDelete);
      setShowDeleteDialog(false);
      setEntryToDelete(null);
    }
  };

  const handleCloseDetailsSheet = () => {
    setShowDetailsSheet(false);
    setSelectedEntry(null);
    onSelectEntry?.(null);
  };

  const canDelete = isSystem || permissions?.canDelete;

  const columns = useBlockedEntriesColumns<T>({
    t,
    scope,
    canDelete,
    enableRowSelection,
    onViewDetails: handleViewDetails,
    onDelete: handleDelete,
  });

  const flatData = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: flatData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(totalRowCount / limit),
    enableRowSelection,
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
    getRowId: (row) => row.id,
  });

  const numberOfSelectedRows = table.getFilteredSelectedRowModel().rows.length;
  const selectedEntries = table.getSelectedRowModel().flatRows.map((row) => row.original);
  const clearSelection = () => table.toggleAllPageRowsSelected(false);

  return (
    <>
      <DataTableWrapper
        table={table}
        isPending={isPending}
        variant="default"
        paginationMode="standard"
        EmptyView={
          <EmptyScreen
            customIcon={<img className="mb-6" src="/slash-icon-cards.svg" />}
            headline={
              searchTerm
                ? t("no_result_found_for", { searchTerm })
                : t(isSystem ? "system_blocklist" : "pbac_resource_blocklist")
            }
            description={t(isSystem ? "add_people_to_system_blocklist" : "add_people_to_blocklist")}
            className="bg-muted mb-16"
            iconWrapperClassName="bg-default"
            dashedBorder={false}
            buttonRaw={
              <div className="flex gap-2">
                <Button
                  StartIcon="plus"
                  onClick={onAddClick}
                  color="primary"
                  disabled={!isSystem && !permissions?.canCreate}>
                  {t("add")}
                </Button>
                {IS_CALCOM && (
                  <Button
                    StartIcon="book"
                    color="secondary"
                    onClick={() =>
                      window.open("https://github.com/OpenCal-Community/cal.diy/wiki/Blocklist", "_blank", "noopener,noreferrer")
                    }>
                    {t("docs")}
                  </Button>
                )}
              </div>
            }
          />
        }
        totalRowCount={totalRowCount}>
        {enableRowSelection && numberOfSelectedRows > 0 && renderBulkActions && (
          <DataTableSelectionBar.Root className="bottom-16! justify-center md:w-max">
            <p className="text-brand-subtle px-2 text-center text-xs leading-none sm:text-sm sm:font-medium">
              {t("number_selected", { count: numberOfSelectedRows })}
            </p>
            {renderBulkActions(selectedEntries, clearSelection)}
          </DataTableSelectionBar.Root>
        )}
      </DataTableWrapper>

      <BlocklistEntryDetailsSheet
        scope={scope}
        entry={selectedEntry}
        isOpen={showDetailsSheet}
        onClose={handleCloseDetailsSheet}
        handleDeleteBlocklistEntry={handleDelete}
        detailsData={detailsQuery?.data}
        isLoading={detailsQuery?.isLoading ?? false}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <ConfirmationDialogContent
          variety="danger"
          title={t(isSystem ? "remove_value_from_system_blocklist" : "remove_value_from_blocklist", {
            value: entryToDelete?.value,
          })}
          confirmBtnText={t("remove")}
          isPending={isDeleting}
          onConfirm={confirmDelete}>
          {t(
            isSystem
              ? "remove_value_from_system_blocklist_description"
              : "remove_value_from_blocklist_description"
          )}
        </ConfirmationDialogContent>
      </Dialog>
    </>
  );
}
