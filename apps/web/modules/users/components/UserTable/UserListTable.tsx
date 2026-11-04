"use client";

import { checkAdminOrOwner } from "@calcom/features/auth/lib/checkAdminOrOwner";
import { ColumnFilterType, convertFacetedValuesToMap, type FacetedValue } from "@calcom/features/data-table";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { downloadAsCsv } from "@calcom/lib/csvUtils";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import type { FilterType } from "@calcom/types/data-table";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Checkbox } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { LimitedBadges } from "@calcom/web/components/ui/LimitedBadges";
import {
  generateCsvRawForMembersTable,
  generateHeaderFromReactTable,
} from "@calcom/web/modules/users/lib/UserListTableUtils";
import { keepPreviousData } from "@tanstack/react-query";
import {
  type CellContext,
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type HeaderContext,
  useReactTable,
} from "@tanstack/react-table";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import posthog from "posthog-js";
import { useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import {
  DataTableFilters,
  DataTableSegment,
  DataTableSelectionBar,
  DataTableToolbar,
  DataTableWrapper,
} from "~/data-table/components";
import { DataTableProvider } from "~/data-table/DataTableProvider";
import { useColumnFilters } from "~/data-table/hooks/useColumnFilters";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import { useSegments } from "~/data-table/hooks/useSegments";
import { DeleteBulkUsers } from "./BulkActions/DeleteBulkUsers";
import { DynamicLink } from "./BulkActions/DynamicLink";
import { EventTypesList } from "./BulkActions/EventTypesList";
import { ChangeUserRoleModal } from "./ChangeUserRoleModal";
import { DeleteMemberModal } from "./DeleteMemberModal";
import { EditUserSheet } from "./EditSheet/EditUserSheet";
import { InviteMemberModal } from "./InviteMemberModal";
import type { UserTableAction, UserTableState, UserTableUser } from "./types";
import { TableActions } from "./UserTableActions";

const initialState: UserTableState = {
  changeMemberRole: {
    showModal: false,
  },
  deleteMember: {
    showModal: false,
  },
  impersonateMember: {
    showModal: false,
  },
  inviteMember: {
    showModal: false,
  },
  editSheet: {
    showModal: false,
  },
};

const initalColumnVisibility = {
  select: true,
  member: true,
  role: true,
  teams: true,
  createdAt: false,
  updatedAt: false,
  completedOnboarding: false,
  twoFactorEnabled: false,
  actions: true,
};

function reducer(state: UserTableState, action: UserTableAction): UserTableState {
  switch (action.type) {
    case "SET_CHANGE_MEMBER_ROLE_ID":
      return { ...state, changeMemberRole: action.payload };
    case "SET_DELETE_ID":
      return { ...state, deleteMember: action.payload };
    case "SET_IMPERSONATE_ID":
      return { ...state, impersonateMember: action.payload };
    case "INVITE_MEMBER":
      return { ...state, inviteMember: action.payload };
    case "EDIT_USER_SHEET":
      return { ...state, editSheet: action.payload };
    case "CLOSE_MODAL":
      return {
        ...state,
        changeMemberRole: { showModal: false },
        deleteMember: { showModal: false },
        impersonateMember: { showModal: false },
        inviteMember: { showModal: false },
        editSheet: { showModal: false },
      };
    default:
      return state;
  }
}

type UserListTableProps = {
  org: { user?: { role?: string }; slug?: string; name?: string; canAdminImpersonate?: boolean };
  teams: {
    id: number;
    name: string;
    slug: string | null;
    logoUrl?: string | null;
    isOrganization?: boolean;
  }[];
  attributes?: {
    id: string;
    name: string;
    type: string;
    isWeightsEnabled?: boolean;
    options: { value: string; weight?: number }[];
  }[];
  facetedTeamValues?: {
    roles: { id: string; name: string }[];
    teams: {
      id: number;
      name: string;
      slug: string | null;
      logoUrl?: string | null;
      isOrganization?: boolean;
    }[];
    attributes: {
      id: string;
      name: string;
      options: {
        value: string;
      }[];
    }[];
  };
  permissions?: {
    canRemoveMember: boolean;
    canChangeRole: boolean;
    canChangeMemberRole: boolean;
    canRemove: boolean;
    canInvite: boolean;
    canImpersonate: boolean;
    canResetPassword: boolean;
    canEditAttributesForUser: boolean;
    canViewAttributes: boolean;
  };
};

function UserListTable(props: UserListTableProps): JSX.Element | null {
  const pathname = usePathname();
  if (!pathname) return null;
  return (
    <DataTableProvider tableIdentifier={pathname} useSegments={useSegments} defaultPageSize={25}>
      <UserListTableContent {...props} />
    </DataTableProvider>
  );
}

function UserListTableContent({
  org,
  attributes,
  teams,
  facetedTeamValues,
  permissions,
}: UserListTableProps): JSX.Element {
  const [dynamicLinkVisible, setDynamicLinkVisible] = useQueryState("dynamicLink", parseAsBoolean);
  const orgBranding = null as {
    slug?: string;
    name?: string;
    fullDomain?: string;
    canAdminImpersonate?: boolean;
  } | null;
  const domain = WEBAPP_URL;
  const { t } = useLocale();

  const { data: session } = useSession();
  const isPlatformUser = false;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isDownloading, setIsDownloading] = useState(false);
  const [rowSelection, setRowSelection] = useState({});

  const columnFilters = useColumnFilters();

  const { limit, offset, searchTerm, ctaContainerRef } = useDataTable();

  const data = { rows: [] as UserTableUser[], meta: { totalRowCount: 0 } };
  const isPending = false;

  const adminOrOwner = checkAdminOrOwner(
    org?.user?.role as import("@calcom/prisma/enums").MembershipRole | undefined
  );

  //we must flatten the array of arrays from the useInfiniteQuery hook
  const flatData = useMemo<UserTableUser[]>(() => data?.rows ?? [], [data]);

  const memorisedColumns = useMemo(() => {
    // Use PBAC permissions if available, otherwise fall back to role-based check
    const tablePermissions = {
      canEdit: permissions?.canChangeMemberRole ?? adminOrOwner,
      canRemove: permissions?.canRemove ?? adminOrOwner,
      canResendInvitation: permissions?.canInvite ?? adminOrOwner,
      canImpersonate: permissions?.canImpersonate ?? adminOrOwner,
      canResetPassword: permissions?.canResetPassword ?? adminOrOwner,
    };
    const generateAttributeColumns = (): ColumnDef<UserTableUser>[] => {
      if (!attributes?.length) {
        return [];
      }
      const attributeColumns: ColumnDef<UserTableUser>[] =
        attributes?.map((attribute) => {
          // TODO: We need to normalize AttributeOption table first
          // so that we can have `number_value` column for numeric operations.
          // Currently, `value` column is used for both text and number attributes.
          //
          // const isNumber = attribute.type === "NUMBER";
          const isNumber = false;
          const isText = attribute.type === "TEXT";
          const isSingleSelect = attribute.type === "SINGLE_SELECT";
          // const isMultiSelect = attribute.type === "MULTI_SELECT";
          let filterType: FilterType = ColumnFilterType.MULTI_SELECT;
          if (isNumber) {
            filterType = ColumnFilterType.NUMBER;
          } else if (isText) {
            filterType = ColumnFilterType.TEXT;
          } else if (isSingleSelect) {
            filterType = ColumnFilterType.SINGLE_SELECT;
          }

          return {
            id: attribute.id,
            header: attribute.name,
            meta: {
              filter: { type: filterType },
            },
            size: 120,
            accessorFn: (data: UserTableUser) =>
              data.attributes?.find((attr) => attr.attributeId === attribute.id)?.value,
            cell: ({ row }: CellContext<UserTableUser, unknown>) => {
              const attributeValues = row.original.attributes?.filter(
                (attr) => attr.attributeId === attribute.id
              );
              if (!attributeValues || attributeValues.length === 0) return null;

              return (
                <LimitedBadges
                  items={attributeValues.map((attributeValue) => {
                    const isAGroupOption = (attributeValue.contains?.length ?? 0) > 0;
                    let weight = "";
                    if (attribute.isWeightsEnabled) {
                      weight = `${attributeValue.weight || 100}%`;
                    }
                    let groupIndicator = "";
                    if (isAGroupOption) {
                      groupIndicator = " (group)";
                    }
                    let label = attributeValue.value;
                    if (weight) {
                      label = `${label} ${weight}`;
                    }
                    label = `${label}${groupIndicator}`;

                    let variant: "orange" | "gray" = "gray";
                    if (isAGroupOption) {
                      variant = "orange";
                    }

                    return {
                      label,
                      variant,
                    };
                  })}
                  className={classNames(isNumber && "w-full justify-center")}
                />
              );
            },
          };
        }) ?? [];
      return attributeColumns;
    };

    const cols: ColumnDef<UserTableUser>[] = [
      // Disabling select for this PR: Will work on actions etc in a follow up
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        enableResizing: false,
        size: 30,
        header: ({ table }: HeaderContext<UserTableUser, unknown>) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value: boolean | "indeterminate") => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }: CellContext<UserTableUser, unknown>) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean | "indeterminate") => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
          />
        ),
      },
      {
        id: "member",
        accessorFn: (data: UserTableUser) => data.email,
        enableHiding: false,
        enableColumnFilter: false,
        size: 200,
        header: t("members"),
        cell: ({ row }: CellContext<UserTableUser, unknown>) => {
          const { username, name, email, avatarUrl, status } = row.original;
          const displayName = name || username || "No username";
          return (
            <div className="flex items-center gap-2">
              <Avatar
                size="sm"
                alt={displayName}
                imageSrc={getUserAvatarUrl({
                  avatarUrl,
                })}
              />
              <div className="">
                <div
                  data-testid={`member-${username}-username`}
                  className="font-medium text-emphasis text-sm leading-none flex items-center gap-2">
                  {displayName}
                  {status === "PAUSED" && <Badge variant="gray">{t("paused")}</Badge>}
                </div>
                <div
                  data-testid={`member-${username}-email`}
                  className="mt-1 text-sm text-subtle leading-none">
                  {email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        accessorFn: (data: UserTableUser) => data.role,
        header: t("role"),
        size: 100,
        meta: {
          filter: { type: ColumnFilterType.MULTI_SELECT },
        },
        cell: ({ row, table }: CellContext<UserTableUser, unknown>) => {
          const { role, username, customRole } = row.original;
          const roleName = customRole?.name || role;
          let roleVariant: "gray" | "blue" = "blue";
          if (role === "MEMBER") {
            roleVariant = "gray";
          }
          return (
            <Badge
              data-testid={`member-${username}-role`}
              variant={roleVariant}
              onClick={() => {
                table.getColumn("role")?.setFilterValue([role]);
              }}>
              {roleName}
            </Badge>
          );
        },
      },
      {
        id: "teams",
        accessorFn: (data: UserTableUser) =>
          data.teams.map(
            (team: {
              id: number;
              name: string;
              slug: string | null;
              logoUrl?: string | null;
              isOrganization?: boolean;
            }) => team.name
          ),
        header: t("teams"),
        size: 140,
        meta: {
          filter: { type: ColumnFilterType.MULTI_SELECT },
        },
        cell: ({ row, table }: CellContext<UserTableUser, unknown>) => {
          const { teams, accepted, email, username } = row.original;

          return (
            <div className="flex h-full flex-wrap items-center gap-2">
              {!accepted && (
                <Badge
                  data-testid2={`member-${username}-pending`}
                  variant="red"
                  className="text-xs"
                  data-testid={`email-${email.replace("@", "")}-pending`}
                  onClick={() => {
                    table.getColumn("role")?.setFilterValue(["PENDING"]);
                  }}>
                  {t("pending")}
                </Badge>
              )}

              <LimitedBadges
                items={teams.map(
                  (team: {
                    id: number;
                    name: string;
                    slug: string | null;
                    logoUrl?: string | null;
                    isOrganization?: boolean;
                  }) => ({
                    label: team.name,
                    variant: "gray" as const,
                    onClick: () => {
                      table.getColumn("teams")?.setFilterValue([team.name]);
                    },
                  })
                )}
              />
            </div>
          );
        },
      },
      ...generateAttributeColumns(),
      {
        id: "lastActiveAt",
        accessorKey: "lastActiveAt",
        header: t("last_active"),
        enableSorting: false,
        enableColumnFilter: true,
        meta: {
          filter: {
            type: ColumnFilterType.DATE_RANGE,
          },
        },
        cell: ({ row }: CellContext<UserTableUser, unknown>) => (
          <div>{row.original.lastActiveAt?.toLocaleDateString() ?? ""}</div>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("member_since"),
        enableSorting: false,
        enableColumnFilter: true,
        meta: {
          filter: {
            type: ColumnFilterType.DATE_RANGE,
          },
        },
        cell: ({ row }: CellContext<UserTableUser, unknown>) => (
          <div>{row.original.createdAt?.toLocaleDateString() ?? ""}</div>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: t("last_updated"),
        enableSorting: false,
        enableColumnFilter: true,
        meta: {
          filter: {
            type: ColumnFilterType.DATE_RANGE,
          },
        },
        cell: ({ row }: CellContext<UserTableUser, unknown>) => (
          <div>{row.original.updatedAt?.toLocaleDateString() ?? ""}</div>
        ),
      },
      {
        id: "completedOnboarding",
        accessorKey: "completedOnboarding",
        header: t("completed_onboarding"),
        enableSorting: false,
        enableColumnFilter: false,
        size: 80,
        cell: ({ row }: CellContext<UserTableUser, unknown>) => {
          const { completedOnboarding } = row.original;
          let onboardingVariant: "green" | "gray" = "gray";
          let onboardingText = t("no");
          if (completedOnboarding) {
            onboardingVariant = "green";
            onboardingText = t("yes");
          }
          return <Badge variant={onboardingVariant}>{onboardingText}</Badge>;
        },
      },
      {
        id: "twoFactorEnabled",
        accessorKey: "twoFactorEnabled",
        header: t("2fa"),
        enableHiding: adminOrOwner,
        enableSorting: false,
        enableColumnFilter: false,
        size: 80,
        cell: ({ row }: CellContext<UserTableUser, unknown>) => {
          const { twoFactorEnabled } = row.original;
          if (!adminOrOwner || twoFactorEnabled === undefined) {
            return null;
          }
          let twoFaVariant: "green" | "gray" = "gray";
          let twoFaText = t("disabled");
          if (twoFactorEnabled) {
            twoFaVariant = "green";
            twoFaText = t("enabled");
          }
          return <Badge variant={twoFaVariant}>{twoFaText}</Badge>;
        },
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        enableResizing: false,
        size: 80,
        cell: ({ row }: CellContext<UserTableUser, unknown>) => {
          const user = row.original;
          const permissionsRaw = tablePermissions;
          const isSelf = user.id === session?.user.id;

          const permissionsForUser = {
            canEdit:
              ((permissionsRaw.canEdit ?? false) || (permissions?.canEditAttributesForUser ?? false)) &&
              user.accepted &&
              !isSelf,
            canRemove: (permissionsRaw.canRemove ?? false) && !isSelf,
            canImpersonate:
              user.accepted &&
              !isSelf &&
              !!org?.canAdminImpersonate &&
              (permissionsRaw.canImpersonate ?? false),
            canLeave: user.accepted && isSelf,
            canResendInvitation: (permissionsRaw.canResendInvitation ?? false) && !user.accepted,
            canResetPassword: (permissionsRaw.canResetPassword ?? false) && user.accepted && !isSelf,
          };

          return (
            <TableActions
              user={user}
              permissionsForUser={permissionsForUser}
              dispatch={dispatch}
              domain={domain}
            />
          );
        },
      },
    ];

    return cols;
  }, [session?.user.id, adminOrOwner, domain, attributes, org?.canAdminImpersonate, permissions, t]);

  const table = useReactTable({
    data: flatData,
    columns: memorisedColumns,
    enableRowSelection: true,
    manualPagination: true,
    state: {
      rowSelection,
    },
    initialState: {
      columnVisibility: initalColumnVisibility,
      columnPinning: {
        left: ["select", "member"],
        right: ["actions"],
      },
    },
    defaultColumn: {
      size: 150,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId: (row: UserTableUser) => `${row.id}`,
    getFacetedUniqueValues: (_: unknown, columnId: string) => (): Map<FacetedValue, number> => {
      if (facetedTeamValues) {
        switch (columnId) {
          case "role":
            return convertFacetedValuesToMap(
              facetedTeamValues.roles.map((role) => ({
                label: role.name,
                value: role.id,
              }))
            );
          case "teams":
            return convertFacetedValuesToMap(
              facetedTeamValues.teams.map((team) => ({
                label: team.name,
                value: team.name,
              }))
            );
          default: {
            const attribute = facetedTeamValues.attributes.find((attr) => attr.id === columnId);
            if (attribute) {
              return convertFacetedValuesToMap(
                attribute?.options.map(({ value }) => ({
                  label: value,
                  value,
                })) ?? []
              );
            }
            return new Map();
          }
        }
      }
      return new Map();
    },
  });

  const utils = trpc.useUtils();

  const numberOfSelectedRows = table.getSelectedRowModel().rows.length;

  const handleDownload = async (): Promise<void> => {
    try {
      if (!org?.slug || !org?.name) {
        throw new Error("Org slug or name is missing.");
      }
      setIsDownloading(true);
      const headers = generateHeaderFromReactTable(table);
      if (!headers || !headers.length) {
        throw new Error("Header is missing.");
      }

      // Fetch all pages
      let allRows: UserTableUser[] = [];
      let offset: number | undefined = 0;
      const limit = 100;

      while (offset !== undefined) {
        const result = { rows: [] as UserTableUser[] };

        if (!result.rows?.length) {
          offset = undefined;
          continue;
        }

        allRows = [...allRows, ...result.rows];
        offset = offset + limit;
      }

      if (!allRows.length) {
        throw new Error("There are no members found.");
      }

      const ATTRIBUTE_IDS = attributes?.map((attr) => attr.id) ?? [];
      const csvRaw = generateCsvRawForMembersTable(headers, allRows, ATTRIBUTE_IDS, domain);
      if (!csvRaw) {
        throw new Error("Generating CSV file failed.");
      }

      const filename = `${org.name}_${new Date().toISOString().split("T")[0]}.csv`;
      downloadAsCsv(csvRaw, filename);
    } catch (error) {
      showToast(`Error: ${error}`, "error");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <DataTableWrapper<UserTableUser>
        testId="user-list-data-table"
        table={table}
        isPending={isPending}
        totalRowCount={data?.meta?.totalRowCount}
        paginationMode="standard"
        ToolbarLeft={
          <>
            <DataTableToolbar.SearchBar />
            <DataTableFilters.ColumnVisibilityButton table={table} />
            <DataTableFilters.FilterBar table={table} />
          </>
        }
        ToolbarRight={
          <>
            <DataTableFilters.ClearFiltersButton />
            <DataTableSegment.SaveButton />
            <DataTableSegment.Select />
          </>
        }>
        {numberOfSelectedRows >= 2 && dynamicLinkVisible && (
          <DataTableSelectionBar.Root className="bottom-[7.3rem]! md:bottom-32!">
            <DynamicLink table={table} domain={domain} />
          </DataTableSelectionBar.Root>
        )}
        {numberOfSelectedRows > 0 && (
          <DataTableSelectionBar.Root className="bottom-16! justify-center md:w-max">
            <p className="shrink-0 px-2 text-center text-brand-subtle text-xs leading-none sm:font-medium sm:text-sm">
              {t("number_selected", { count: numberOfSelectedRows })}
            </p>
            {!isPlatformUser && (
              <>
                {permissions?.canChangeMemberRole && (
                  <DeleteBulkUsers
                    users={table.getSelectedRowModel().flatRows.map((row) => row.original)}
                    onRemove={() => table.toggleAllPageRowsSelected(false)}
                  />
                )}
                {numberOfSelectedRows >= 2 && (
                  <DataTableSelectionBar.Button
                    color="secondary"
                    onClick={() => setDynamicLinkVisible(!dynamicLinkVisible)}
                    icon="handshake">
                    {t("group_meeting")}
                  </DataTableSelectionBar.Button>
                )}
                {(permissions?.canChangeMemberRole ?? adminOrOwner) && (
                  <EventTypesList
                    table={table}
                    orgTeams={teams?.map((t) => ({ id: t.id, slug: t.slug ?? "", title: t.name }))}
                  />
                )}
              </>
            )}
            {(permissions?.canRemove ?? adminOrOwner) && (
              <DeleteBulkUsers
                users={table.getSelectedRowModel().flatRows.map((row) => row.original)}
                onRemove={() => table.toggleAllPageRowsSelected(false)}
              />
            )}
          </DataTableSelectionBar.Root>
        )}
      </DataTableWrapper>

      {state.deleteMember.showModal && <DeleteMemberModal state={state} dispatch={dispatch} />}
      {state.inviteMember.showModal && <InviteMemberModal dispatch={dispatch} />}
      {/* Impersonation modal removed (enterprise) */}
      {state.changeMemberRole.showModal && <ChangeUserRoleModal dispatch={dispatch} state={state} />}
      {state.editSheet.showModal && (
        <EditUserSheet
          dispatch={dispatch}
          state={state}
          canViewAttributes={permissions?.canViewAttributes}
          canEditAttributesForUser={permissions?.canEditAttributesForUser}
          canChangeMemberRole={permissions?.canChangeMemberRole ?? adminOrOwner}
        />
      )}

      {ctaContainerRef.current &&
        createPortal(
          <div className="flex items-center gap-2">
            <DataTableToolbar.CTA
              type="button"
              color="secondary"
              StartIcon="file-down"
              loading={isDownloading}
              onClick={() => handleDownload()}
              data-testid="export-members-button">
              {t("download")}
            </DataTableToolbar.CTA>
            {(permissions?.canInvite ?? adminOrOwner) && (
              <DataTableToolbar.CTA
                type="button"
                color="primary"
                StartIcon="plus"
                onClick={() => {
                  dispatch({
                    type: "INVITE_MEMBER",
                    payload: {
                      showModal: true,
                    },
                  });
                  posthog.capture("add_organization_member_clicked");
                }}
                data-testid="new-organization-member-button">
                {t("add")}
              </DataTableToolbar.CTA>
            )}
          </div>,
          ctaContainerRef.current
        )}
    </>
  );
}

export { UserListTable };
export type { UserListTableProps };
