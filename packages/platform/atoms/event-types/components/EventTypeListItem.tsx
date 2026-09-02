"use client";

import {
  getDurationMinutesAccessibleLabel,
  getDurationMinutesFormatted,
} from "@calcom/lib/formatEventDuration";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import { DurationText } from "@calcom/ui/components/duration";
import { showToast } from "@calcom/ui/components/toast";
import Link from "next/link";
import { useState } from "react";
import type { AtomEventTypeListItem } from "../types";

const EventTypeContent = ({ eventType }: { eventType: AtomEventTypeListItem }) => {
  const { t } = useLocale();

  return (
    <div>
      <div className="space-x-2 rtl:space-x-reverse">
        <span className="text-emphasis truncate font-medium">{eventType.title}</span>
      </div>
      <div className="text-subtle mt-1">
        {eventType.description && <span className="block">{eventType.description}</span>}
        <Badge variant="gray" className="text-xs">
          <DurationText label={getDurationMinutesAccessibleLabel(eventType.length, t) ?? ""}>
            {getDurationMinutesFormatted(eventType.length, t)}
          </DurationText>
        </Badge>
      </div>
    </div>
  );
};

type EventTypeActionsProps = {
  eventType: AtomEventTypeListItem;
  isDeletable: boolean;
  getEventTypeUrl?: (eventTypeId: number) => string;
  deleteFunction: ({ eventTypeId }: { eventTypeId: number }) => void;
};

const EventTypeActions = ({
  eventType,
  isDeletable,
  getEventTypeUrl,
  deleteFunction,
}: EventTypeActionsProps) => {
  const { t } = useLocale();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  return (
    <>
      <Dropdown>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid={`event-type-options-${eventType.id}`}
            type="button"
            variant="icon"
            color="secondary"
            StartIcon="ellipsis"
            aria-label={t("options")}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {getEventTypeUrl && (
            <DropdownMenuItem className="min-w-40 focus:ring-muted">
              <DropdownItem type="button" StartIcon="pencil" href={getEventTypeUrl(eventType.id)}>
                {t("edit")}
              </DropdownItem>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-w-40 focus:ring-muted">
            <DropdownItem
              type="button"
              color="destructive"
              StartIcon="trash"
              data-testid={`delete-event-type-${eventType.id}`}
              className="rounded-t-none"
              onClick={() => {
                if (!isDeletable) {
                  showToast(t("cannot_delete_event_type"), "error");
                  return;
                }
                setIsDeleteDialogOpen(true);
              }}>
              {t("delete")}
            </DropdownItem>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </Dropdown>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <ConfirmationDialogContent
          variety="danger"
          title={t("delete_event_type")}
          confirmBtnText={t("delete")}
          onConfirm={() => {
            deleteFunction({ eventTypeId: eventType.id });
            setIsDeleteDialogOpen(false);
          }}>
          {t("delete_event_type_confirmation")}
        </ConfirmationDialogContent>
      </Dialog>
    </>
  );
};

type EventTypeListItemProps = {
  eventType: AtomEventTypeListItem;
  deleteFunction: ({ eventTypeId }: { eventTypeId: number }) => void;
  isDeletable?: boolean;
  getEventTypeUrl?: (eventTypeId: number) => string;
};

export function EventTypeListItem({
  eventType,
  deleteFunction,
  isDeletable = true,
  getEventTypeUrl,
}: EventTypeListItemProps) {
  const Wrapper: React.ElementType = getEventTypeUrl ? Link : "div";
  const wrapperProps = getEventTypeUrl
    ? {
        href: getEventTypeUrl(eventType.id),
        title: eventType.title,
      }
    : {};

  return (
    <li key={eventType.id}>
      <div className="hover:bg-muted flex items-center justify-between px-3 py-5 transition sm:px-4">
        <div className="group flex w-full items-center justify-between">
          <Wrapper className="flex-grow truncate text-sm" {...wrapperProps}>
            <EventTypeContent eventType={eventType} />
          </Wrapper>
        </div>
        <EventTypeActions
          eventType={eventType}
          isDeletable={isDeletable}
          getEventTypeUrl={getEventTypeUrl}
          deleteFunction={deleteFunction}
        />
      </div>
    </li>
  );
}
