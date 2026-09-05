import { filterQuerySchema } from "@calcom/features/filters/lib/getTeamsFiltersFromQuery";
import { getOrgOrTeamAvatar } from "@calcom/lib/defaultAvatarImage";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useTypedQuery } from "@calcom/lib/hooks/useTypedQuery";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { Divider, VerticalDivider } from "@calcom/ui/components/divider";
import { FilterSearchField } from "@calcom/ui/components/form";
import { AnimatedPopover } from "@calcom/ui/components/popover";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { LayersIcon, UserIcon } from "@coss/ui/icons";
import { useSession } from "next-auth/react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useState } from "react";

function useFilterQuery() {
  // passthrough allows additional params to not be removed
  return useTypedQuery(filterQuerySchema.passthrough());
}

export const TeamsFilter = ({
  popoverTriggerClassNames,
  useProfileFilter = false,
  showVerticalDivider = false,
}: {
  popoverTriggerClassNames?: string;
  showVerticalDivider?: boolean;
  useProfileFilter?: boolean;
}) => {
  const { t } = useLocale();
  const session = useSession();
  const [search, setSearch] = useState("");

  const { data: query, pushItemToKey, removeItemByKeyAndValue, removeAllQueryParams } = useFilterQuery();

  const teams = null as
    | { id: number; name: string; slug: string | null; logoUrl?: string | null; isOrganization?: boolean }[]
    | null;

  const getCheckedOptionsNames = () => {
    const checkedOptions: string[] = [];
    const teamIds = query.teamIds;
    const users = useProfileFilter ? query.upIds : query.userIds;
    if (teamIds) {
      const selectedTeamsNames = teams
        ?.filter((team) => {
          return teamIds.includes(team.id);
        })
        ?.map((team) => team.name);
      if (selectedTeamsNames) {
        checkedOptions.push(...selectedTeamsNames);
      }
      return `${checkedOptions.join(",")}`;
    }
    if (users) {
      return t("yours");
    }
    return t("all");
  };

  if (!teams || !teams.length) return null;

  const userId = session.data?.user?.id || 0;
  const upId = session.data?.upId || "";
  const isUserInQuery = useProfileFilter ? query.upIds?.includes(upId) : query.userIds?.includes(userId);
  return (
    <div className="flex items-center">
      <AnimatedPopover
        text={getCheckedOptionsNames()}
        popoverTriggerClassNames={popoverTriggerClassNames}
        prefix={`${t("teams")}: `}>
        <FilterCheckboxFieldsContainer>
          <FilterSearchField
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <FilterCheckboxField
            id="all"
            icon={<LayersIcon className="h-4 w-4" />}
            checked={!query.teamIds && !isUserInQuery}
            onChange={removeAllQueryParams}
            label={t("all")}
          />

          <FilterCheckboxField
            id="yours"
            icon={<UserIcon className="h-4 w-4" />}
            checked={!!isUserInQuery}
            onChange={(e) => {
              if (e.target.checked) {
                if (useProfileFilter) pushItemToKey("upIds", upId);
                else pushItemToKey("userIds", userId);
              } else if (!e.target.checked) {
                if (useProfileFilter) removeItemByKeyAndValue("upIds", upId);
                else removeItemByKeyAndValue("userIds", userId);
              }
            }}
            label={t("yours")}
          />
          <Divider />
          {teams
            ?.filter((team) => !team?.isOrganization)
            .filter((team) => team.name.toLowerCase().includes(search.toLowerCase()))
            .map((team) => (
              <FilterCheckboxField
                key={team.id}
                id={team.name}
                label={team.name}
                checked={!!query.teamIds?.includes(team.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    pushItemToKey("teamIds", team.id);
                  } else if (!e.target.checked) {
                    removeItemByKeyAndValue("teamIds", team.id);
                  }
                }}
                icon={
                  <Avatar
                    alt={team?.name}
                    imageSrc={getOrgOrTeamAvatar({ name: team.name, logoUrl: team.logoUrl ?? null })}
                    size="xs"
                  />
                }
              />
            ))}
        </FilterCheckboxFieldsContainer>
      </AnimatedPopover>
      {showVerticalDivider && <VerticalDivider />}
    </div>
  );
};

export const FilterCheckboxFieldsContainer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={classNames("flex flex-col gap-0.5 [&>*:first-child]:mt-1 [&>*:last-child]:mb-1", className)}>
      {children}
    </div>
  );
};

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
};

export const FilterCheckboxField = forwardRef<HTMLInputElement, Props>(
  ({ label, icon, ...rest }, ref) => {
    return (
      <div className="hover:bg-cal-muted flex items-center py-2 pl-3 pr-2.5 transition hover:cursor-pointer">
        <label className="flex w-full max-w-full items-center justify-between hover:cursor-pointer">
          <div className="flex items-center truncate">
            {icon && (
              <div className="text-default flex h-4 w-4 items-center justify-center ltr:mr-2 rtl:ml-2">
                {icon}
              </div>
            )}
            <Tooltip content={label}>
              <label
                htmlFor={rest.id}
                className="text-default me-1 cursor-pointer truncate text-sm font-medium">
                {label}
              </label>
            </Tooltip>
          </div>
          <div className="flex h-5 items-center">
            <input
              {...rest}
              ref={ref}
              type="checkbox"
              className="text-emphasis dark:text-muted focus:ring-emphasis border-default bg-default checked:border-transparent! checked:bg-gray-800! h-4 w-4 rounded-[4px] transition hover:cursor-pointer"
            />
          </div>
        </label>
      </div>
    );
  }
);

FilterCheckboxField.displayName = "FilterCheckboxField";
