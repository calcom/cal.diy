import type { EventTypeSetupProps, FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ButtonGroup } from "@calcom/ui/components/buttonGroup";
import { VerticalDivider } from "@calcom/ui/components/divider";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import { Label, Switch } from "@calcom/ui/components/form";
import type { VerticalTabItemProps } from "@calcom/ui/components/navigation";
import { HorizontalTabs, VerticalTabs } from "@calcom/ui/components/navigation";
import { Skeleton } from "@calcom/ui/components/skeleton";
import { showToast } from "@calcom/ui/components/toast";
import { Tooltip } from "@calcom/ui/components/tooltip";
import {
  EventTypeEmbedButton,
  EventTypeEmbedDialog,
} from "@calcom/web/modules/embed/components/EventTypeEmbed";
import WebShell from "@calcom/web/modules/shell/Shell";
import { LoaderIcon } from "@coss/ui/icons";
import { Suspense, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Shell as PlatformShell } from "../../../../../packages/platform/atoms/src/components/ui/shell";
import { DeleteDialog } from "./dialogs/DeleteDialog";

type Props = {
  children: React.ReactNode;
  eventType: EventTypeSetupProps["eventType"];
  currentUserMembership: EventTypeSetupProps["currentUserMembership"];
  team: EventTypeSetupProps["team"];
  disableBorder?: boolean;
  formMethods: UseFormReturn<FormValues>;
  isUpdateMutationLoading?: boolean;
  isUserOrganizationAdmin: boolean;
  bookerUrl: string;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
  isPlatform?: boolean;
  tabsNavigation: VerticalTabItemProps[];
  allowDelete?: boolean;
  saveButtonRef?: React.RefObject<HTMLButtonElement>;
};

function EventTypeSingleLayout({
  children,
  eventType,
  currentUserMembership,
  team,
  disableBorder,
  isUpdateMutationLoading,
  formMethods,
  isUserOrganizationAdmin,
  bookerUrl,
  onDelete,
  isDeleting,
  isPlatform,
  tabsNavigation,
  allowDelete = true,
  saveButtonRef,
}: Props) {
  const { t } = useLocale();
  const eventTypesLockedByOrg = eventType.team?.parent?.organizationSettings?.lockEventTypeCreationForUsers;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const hasPermsToDelete =
    currentUserMembership?.role !== "MEMBER" ||
    !currentUserMembership ||
    formMethods.getValues("schedulingType") === SchedulingType.MANAGED ||
    isUserOrganizationAdmin;

  const isManagedEventType = formMethods.getValues("schedulingType") === SchedulingType.MANAGED;
  const isChildrenManagedEventType =
    Boolean(formMethods.getValues("metadata")?.managedEventConfig) &&
    formMethods.getValues("schedulingType") !== SchedulingType.MANAGED;
  const isChildHiddenLocked =
    isChildrenManagedEventType &&
    !formMethods.getValues("metadata")?.managedEventConfig?.unlockedFields?.hidden;
  const shouldLockDisableProps = (_field: string) => ({
    disabled: false,
    LockedIcon: false as const,
    isLocked: false,
  });
  const shouldLockIndicator = (_field: string) => false;
  const EventTypeTabs = tabsNavigation;
  const permalink = `${bookerUrl}/${
    team ? `${!team.parentId ? "team/" : ""}${team.slug}` : formMethods.getValues("users")[0].username
  }/${eventType.slug}`;

  const embedLink = `${
    team ? `team/${team.slug}` : formMethods.getValues("users")[0].username
  }/${formMethods.getValues("slug")}`;
  const isManagedEvent = formMethods.getValues("schedulingType") === SchedulingType.MANAGED ? "_managed" : "";

  const [Shell] = useMemo(() => {
    return isPlatform ? [PlatformShell] : [WebShell];
  }, [isPlatform]);
  const teamId = eventType.team?.id;

  return (
    <Shell
      backPath={teamId ? `/event-types?teamId=${teamId}` : "/event-types"}
      title={`${eventType.title} | ${t("event_type")}`}
      heading={
        <div className="flex min-w-0 items-center">
          <span className="min-w-0 truncate">{eventType.title}</span>
          {eventType.team && (
            <Badge className="ml-2 text-xs" variant="gray" startIcon="users">
              {eventType.team.name}
            </Badge>
          )}
        </div>
      }
      CTA={
        <div className="flex items-center justify-end">
          {(!isChildrenManagedEventType || !isChildHiddenLocked) && (
            <>
              <div
                className={classNames(
                  "hidden cursor-pointer items-center rounded-md transition sm:hover:bg-cal-muted",
                  formMethods.watch("hidden") ? "pl-2" : "",
                  "lg:flex"
                )}>
                {formMethods.watch("hidden") && (
                  <Skeleton
                    as={Label}
                    htmlFor="hiddenSwitch"
                    className="mt-2 hidden cursor-pointer self-center whitespace-nowrap pr-2 sm:inline">
                    {t("hidden")}
                  </Skeleton>
                )}
                <Tooltip
                  sideOffset={4}
                  content={
                    isChildHiddenLocked
                      ? t("locked_by_team_admin")
                      : formMethods.watch("hidden")
                        ? t("show_eventtype_on_profile")
                        : t("hide_from_profile")
                  }
                  side="bottom">
                  <div className="self-center rounded-md">
                    <Switch
                      id="hiddenSwitch"
                      disabled={eventTypesLockedByOrg || isChildHiddenLocked}
                      checked={!formMethods.watch("hidden")}
                      onCheckedChange={(e) => {
                        formMethods.setValue("hidden", !e, { shouldDirty: true });
                      }}
                    />
                  </div>
                </Tooltip>
              </div>
              <VerticalDivider className="hidden lg:block" />
            </>
          )}

          {/* TODO: Figure out why combined isnt working - works in storybook */}
          <ButtonGroup combined containerProps={{ className: "border-default hidden lg:flex" }}>
            {!isManagedEventType && (
              <>
                {/* We have to warp this in tooltip as it has a href which disables the tooltip on buttons */}
                {!isPlatform && (
                  <Tooltip content={t("preview")} side="bottom" sideOffset={4}>
                    <Button
                      color="secondary"
                      data-testid="preview-button"
                      target="_blank"
                      variant="icon"
                      href={permalink}
                      rel="noreferrer"
                      StartIcon="external-link"
                    />
                  </Tooltip>
                )}

                {!isPlatform && (
                  <Button
                    color="secondary"
                    variant="icon"
                    StartIcon="link"
                    tooltip={t("copy_link")}
                    tooltipSide="bottom"
                    tooltipOffset={4}
                    onClick={() => {
                      navigator.clipboard.writeText(permalink);
                      showToast("Link copied!", "success");
                    }}
                  />
                )}
                {!isPlatform && (
                  <EventTypeEmbedButton
                    embedUrl={encodeURIComponent(embedLink)}
                    StartIcon="code"
                    color="secondary"
                    variant="icon"
                    namespace={eventType.slug}
                    tooltip={t("embed")}
                    tooltipSide="bottom"
                    tooltipOffset={4}
                    eventId={formMethods.getValues("id")}
                  />
                )}
              </>
            )}
            {!isChildrenManagedEventType && allowDelete && (
              <Button
                color="destructive"
                variant="icon"
                StartIcon="trash"
                tooltip={t("delete")}
                tooltipSide="bottom"
                tooltipOffset={4}
                disabled={!hasPermsToDelete}
                onClick={() => setDeleteDialogOpen(true)}
              />
            )}
          </ButtonGroup>

          {(!isPlatform || (isPlatform && allowDelete)) && <VerticalDivider className="hidden lg:block" />}

          <Dropdown>
            <DropdownMenuTrigger asChild>
              <Button className="lg:hidden" StartIcon="ellipsis" variant="icon" color="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent style={{ minWidth: "200px" }}>
              <DropdownMenuItem className="focus:ring-muted">
                <DropdownItem
                  target="_blank"
                  type="button"
                  StartIcon="external-link"
                  href={permalink}
                  rel="noreferrer">
                  {t("preview")}
                </DropdownItem>
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:ring-muted">
                <DropdownItem
                  type="button"
                  StartIcon="link"
                  onClick={() => {
                    navigator.clipboard.writeText(permalink);
                    showToast("Link copied!", "success");
                  }}>
                  {t("copy_link")}
                </DropdownItem>
              </DropdownMenuItem>
              {allowDelete && (
                <DropdownMenuItem className="focus:ring-muted">
                  <DropdownItem
                    type="button"
                    color="destructive"
                    StartIcon="trash"
                    disabled={!hasPermsToDelete}
                    onClick={() => setDeleteDialogOpen(true)}>
                    {t("delete")}
                  </DropdownItem>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!isChildHiddenLocked && (
                <div className="flex h-9 cursor-pointer flex-row items-center justify-between px-4 py-2 transition hover:bg-subtle">
                  <Skeleton
                    as={Label}
                    htmlFor="hiddenSwitch"
                    className="mt-2 inline cursor-pointer self-center pr-2">
                    {formMethods.watch("hidden") ? t("show_eventtype_on_profile") : t("hide_from_profile")}
                  </Skeleton>
                  <Switch
                    id="hiddenSwitch"
                    disabled={eventTypesLockedByOrg}
                    checked={!formMethods.watch("hidden")}
                    onCheckedChange={(e) => {
                      formMethods.setValue("hidden", !e, { shouldDirty: true });
                    }}
                  />
                </div>
              )}
            </DropdownMenuContent>
          </Dropdown>
          <div className="border-default border-l-2" />
          <Button
            ref={saveButtonRef}
            className="ml-4 lg:ml-0"
            type="submit"
            loading={isUpdateMutationLoading}
            disabled={!formMethods.formState.isDirty}
            data-testid="update-eventtype"
            form="event-type-form">
            {t("save")}
          </Button>
        </div>
      }>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <LoaderIcon className="h-5 w-5 animate-spin" />
          </div>
        }>
        <div className="flex flex-col xl:flex-row xl:space-x-6">
          <div className="hidden xl:block">
            <VerticalTabs
              className="primary-navigation w-64"
              tabs={EventTypeTabs}
              sticky
              stickyOffset="var(--navbar-height, 64px)"
              linkShallow
              itemClassname="items-start"
            />
          </div>
          <div className="p-2 md:mx-0 md:p-0 xl:hidden">
            <HorizontalTabs tabs={EventTypeTabs} linkShallow />
          </div>
          <div className="w-full ltr:mr-2 rtl:ml-2">
            <div
              className={classNames(
                "mt-4 rounded-md border-subtle bg-default sm:mx-0 xl:mt-0",
                disableBorder ? "border-0" : "p-2 md:border md:p-6"
              )}>
              {children}
            </div>
          </div>
        </div>
      </Suspense>
      <DeleteDialog
        eventTypeId={eventType.id}
        isManagedEvent={isManagedEvent}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={onDelete}
        isDeleting={isDeleting}
      />

      {!isPlatform && <EventTypeEmbedDialog />}
    </Shell>
  );
}

export { EventTypeSingleLayout };
