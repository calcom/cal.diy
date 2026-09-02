import { useEventTypeById } from "@calcom/atoms/hooks/event-types/private/useEventTypeById";
import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { FromTime } from "@calcom/features/bookings/Booker/utils/dates";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { getDurationAccessibleLabel, getDurationFormatted } from "@calcom/lib/formatEventDuration";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Badge } from "@calcom/ui/components/badge";
import { DialogContent } from "@calcom/ui/components/dialog";
import { DurationText } from "@calcom/ui/components/duration";
import { useEvent } from "@calcom/web/modules/schedules/hooks/useEvent";
import type { ReactNode } from "react";

const BookEventFormWrapper = ({ children, onCancel }: { onCancel: () => void; children: ReactNode }) => {
  const { data } = useEvent();

  return <BookEventFormWrapperComponent child={children} eventLength={data?.length} onCancel={onCancel} />;
};

const PlatformBookEventFormWrapper = ({
  children,
  onCancel,
}: {
  onCancel: () => void;
  children: ReactNode;
}) => {
  const eventId = useBookerStoreContext((state) => state.eventId);
  const { data } = useEventTypeById(eventId);

  return (
    <BookEventFormWrapperComponent child={children} eventLength={data?.lengthInMinutes} onCancel={onCancel} />
  );
};

export const BookEventFormWrapperComponent = ({
  child,
  eventLength,
}: {
  onCancel: () => void;
  child: ReactNode;
  eventLength?: number;
}) => {
  const { i18n, t } = useLocale();
  const selectedTimeslot = useBookerStoreContext((state) => state.selectedTimeslot);
  const selectedDuration = useBookerStoreContext((state) => state.selectedDuration);
  const recurringEventCount = useBookerStoreContext((state) => state.recurringEventCount);
  const { timeFormat, timezone } = useBookerTime();
  if (!selectedTimeslot) {
    return null;
  }
  return (
    <>
      <h1 className="font-cal text-emphasis text-xl leading-5">{t("confirm_your_details")} </h1>
      <div className="my-4 flex flex-wrap gap-2 rounded-md leading-none">
        <Badge variant="grayWithoutHover" startIcon="calendar" size="lg">
          <FromTime
            date={selectedTimeslot}
            timeFormat={timeFormat}
            timeZone={timezone}
            language={i18n.language}
          />
        </Badge>
        {(selectedDuration || eventLength) && (
          <Badge variant="grayWithoutHover" startIcon="clock" size="lg">
            <DurationText label={getDurationAccessibleLabel(selectedDuration || eventLength, t) ?? ""}>
              {getDurationFormatted(selectedDuration || eventLength, t)}
            </DurationText>
          </Badge>
        )}

        {recurringEventCount && recurringEventCount > 1 && (
          <Badge variant="grayWithoutHover" startIcon="refresh-ccw" size="lg">
            <span>
              {t("repeats_num_times", {
                count: recurringEventCount,
              })}
            </span>
          </Badge>
        )}
      </div>
      {child}
    </>
  );
};

export const BookFormAsModal = ({
  visible,
  onCancel,
  children,
}: {
  visible: boolean;
  onCancel: () => void;
  children: ReactNode;
}) => {
  const isPlatform = useIsPlatform();

  return (
    <Dialog open={visible} onOpenChange={onCancel}>
      <DialogContent
        type={undefined}
        enableOverflow
        className="[&_.modalsticky]:border-t-subtle [&_.modalsticky]:bg-default max-h-[80vh] pb-0 [&_.modalsticky]:sticky [&_.modalsticky]:bottom-0 [&_.modalsticky]:left-0 [&_.modalsticky]:right-0 [&_.modalsticky]:-mx-8 [&_.modalsticky]:border-t [&_.modalsticky]:px-8 [&_.modalsticky]:py-4">
        {!isPlatform ? (
          <BookEventFormWrapper onCancel={onCancel}>{children}</BookEventFormWrapper>
        ) : (
          <PlatformBookEventFormWrapper onCancel={onCancel}>{children}</PlatformBookEventFormWrapper>
        )}
      </DialogContent>
    </Dialog>
  );
};
