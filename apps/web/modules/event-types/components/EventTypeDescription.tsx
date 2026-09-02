import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import { Price } from "@calcom/features/bookings/components/event-meta/Price";
import {
  getDurationMinutesAccessibleLabel,
  getDurationMinutesFormatted,
} from "@calcom/lib/formatEventDuration";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { baseEventTypeSelect } from "@calcom/prisma";
import type { EventType, Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Badge } from "@calcom/ui/components/badge";
import { DurationText } from "@calcom/ui/components/duration";
import { PriceIcon } from "@calcom/web/modules/bookings/components/event-meta/PriceIcon";
import { useMemo } from "react";

export type EventTypeDescriptionProps = {
  eventType: Pick<
    EventType,
    | Exclude<keyof typeof baseEventTypeSelect, "recurringEvent" | "description">
    | "metadata"
    | "seatsPerTimeSlot"
  > & {
    descriptionAsSafeHTML?: string | null;
    recurringEvent: Prisma.JsonValue;
  };
  className?: string;
  shortenDescription?: boolean;
  isPublic?: boolean;
};

export const EventTypeDescription = ({
  eventType,
  className,
  shortenDescription,
  isPublic,
}: EventTypeDescriptionProps) => {
  const { t, i18n } = useLocale();

  const recurringEvent = useMemo(
    () => parseRecurringEvent(eventType.recurringEvent),
    [eventType.recurringEvent]
  );

  const metadata = eventTypeMetaDataSchemaWithTypedApps.parse(eventType.metadata);

  const paymentAppData = getPaymentAppData({
    ...eventType,
    metadata,
  });

  return (
    <>
      <div className={classNames("text-subtle", className)}>
        {eventType.descriptionAsSafeHTML && (
          <div
            className={classNames(
              "text-subtle line-clamp-3 wrap-break-word py-1 text-sm sm:max-w-[650px] [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-600",
              shortenDescription ? "line-clamp-4 [&>*:not(:first-child)]:hidden" : ""
            )}
            // eslint-disable-next-line react/no-danger
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTML
            dangerouslySetInnerHTML={{
              __html: markdownToSafeHTML(eventType.descriptionAsSafeHTML || ""),
            }}
          />
        )}
        <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
          {metadata?.multipleDuration ? (
            metadata.multipleDuration.map((dur, idx) => (
              <li key={idx}>
                <Badge variant="gray" startIcon="clock">
                  <DurationText label={getDurationMinutesAccessibleLabel(dur, t) ?? ""}>
                    {getDurationMinutesFormatted(dur, t)}
                  </DurationText>
                </Badge>
              </li>
            ))
          ) : (
            <li>
              <Badge variant="gray" startIcon="clock">
                <DurationText label={getDurationMinutesAccessibleLabel(eventType.length, t) ?? ""}>
                  {getDurationMinutesFormatted(eventType.length, t)}
                </DurationText>
              </Badge>
            </li>
          )}
          {eventType.schedulingType && eventType.schedulingType !== SchedulingType.MANAGED && (
            <li>
              <Badge variant="gray" startIcon="users">
                {eventType.schedulingType === SchedulingType.ROUND_ROBIN && t("round_robin")}
                {eventType.schedulingType === SchedulingType.COLLECTIVE && t("collective")}
              </Badge>
            </li>
          )}
          {recurringEvent?.count && recurringEvent.count > 0 && (
            <li className="hidden xl:block" data-testid="repeat-eventtype">
              <Badge variant="gray" startIcon="refresh-cw">
                {t("repeats_up_to", {
                  count: recurringEvent.count,
                })}
              </Badge>
            </li>
          )}
          {paymentAppData.enabled && (
            <li>
              <Badge
                variant="gray"
                customStartIcon={
                  <PriceIcon currency={paymentAppData.currency} className="h-3 w-3 stroke-[3px]" />
                }>
                <Price
                  currency={paymentAppData.currency}
                  price={paymentAppData.price}
                  displayAlternateSymbol={false}
                />
              </Badge>
            </li>
          )}
          {eventType.requiresConfirmation && (
            <li className="hidden xl:block" data-testid="requires-confirmation-badge">
              <Badge variant="gray" startIcon="clipboard">
                {metadata?.requiresConfirmationThreshold
                  ? t("may_require_confirmation")
                  : t("requires_confirmation")}
              </Badge>
            </li>
          )}
          {/* TODO: Maybe add a tool tip to this? */}
          {eventType.requiresConfirmation || recurringEvent?.count ? (
            <li className="block xl:hidden">
              <Badge variant="gray" startIcon="plus">
                <p>{[eventType.requiresConfirmation, recurringEvent?.count].filter(Boolean).length}</p>
              </Badge>
            </li>
          ) : (
            <></>
          )}
          {eventType?.seatsPerTimeSlot ? (
            <li>
              <Badge variant="gray" startIcon="user">
                <p>{t("event_type_seats", { numberOfSeats: eventType.seatsPerTimeSlot })} </p>
              </Badge>
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
};

export default EventTypeDescription;
