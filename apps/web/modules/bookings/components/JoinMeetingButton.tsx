"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { BookingStatus } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { useJoinableLocation } from "./useJoinableLocation";

interface JoinMeetingButtonProps {
  location: string | null;
  metadata?: unknown;
  bookingStatus: BookingStatus;
  className?: string;
}

export function JoinMeetingButton({
  location,
  metadata,
  bookingStatus,
  className,
}: JoinMeetingButtonProps) {
  const { t } = useLocale();
  const { isJoinable, locationToDisplay, provider } = useJoinableLocation({
    location,
    metadata,
    bookingStatus,
    t,
  });

  if (!isJoinable || !locationToDisplay) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Button
      href={locationToDisplay}
      target="_blank"
      rel="noopener noreferrer"
      className={classNames("flex items-center gap-2", className)}
      onClick={handleClick}>
      {provider?.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={provider.iconUrl}
          className="h-4 w-4 shrink-0 rounded-sm"
          alt={`${provider.label} logo`}
        />
      )}
      {provider?.label
        ? t("join_event_location", { eventLocationType: provider.label })
        : t("join_meeting")}
    </Button>
  );
}
