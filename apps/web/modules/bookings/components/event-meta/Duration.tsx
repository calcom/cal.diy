import { useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { BookerEvent } from "@calcom/features/bookings/types";
import { getDurationAccessibleLabel, getDurationFormatted } from "@calcom/lib/formatEventDuration";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { DurationText } from "@calcom/ui/components/duration";
import { useShouldShowArrows } from "@calcom/web/modules/apps/components/AllApps";
import { ChevronLeftIcon, ChevronRightIcon } from "@coss/ui/icons";
import { useEffect, useRef } from "react";

export { getDurationFormatted } from "@calcom/lib/formatEventDuration";

const renderDuration = (minutes: number | undefined, t: ReturnType<typeof useLocale>["t"]) => {
  const formatted = getDurationFormatted(minutes, t);
  const label = getDurationAccessibleLabel(minutes, t);

  if (!formatted || !label) return null;

  return <DurationText label={label}>{formatted}</DurationText>;
};

export const EventDuration = ({
  event,
}: {
  event: Pick<BookerEvent, "length" | "metadata" | "isDynamic">;
}) => {
  const { t } = useLocale();
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [selectedDuration, setSelectedDuration, state] = useBookerStoreContext((state) => [
    state.selectedDuration,
    state.setSelectedDuration,
    state.state,
  ]);

  const { ref, calculateScroll, leftVisible, rightVisible } = useShouldShowArrows();

  const handleLeft = () => {
    if (ref.current) {
      ref.current.scrollLeft -= 100;
    }
  };

  const handleRight = () => {
    if (ref.current) {
      ref.current.scrollLeft += 100;
    }
  };

  const isDynamicEvent = "isDynamic" in event && event.isDynamic;
  const isEmbed = useIsEmbed();
  // Sets initial value of selected duration to the default duration.
  useEffect(() => {
    // Only store event duration in url if event has multiple durations.
    if (!selectedDuration && (event.metadata?.multipleDuration || isDynamicEvent))
      setSelectedDuration(event.length);
  }, [selectedDuration, setSelectedDuration, event.metadata?.multipleDuration, event.length, isDynamicEvent]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isEmbed) return;
      if (selectedDuration && itemRefs.current[selectedDuration]) {
        // eslint-disable-next-line @calcom/eslint/no-scroll-into-view-embed -- Called on !isEmbed case
        itemRefs.current[selectedDuration]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [selectedDuration, isEmbed]);

  if (!event?.metadata?.multipleDuration && !isDynamicEvent) return <>{renderDuration(event.length, t)}</>;

  const durations = event?.metadata?.multipleDuration || [15, 30, 60, 90];
  const hideDurationSelector = event?.metadata?.hideDurationSelectorInBookingPage;

  // When duration selector is hidden, show only the selected/default duration as text
  // URL params can still set the duration, but the user cannot change it via UI
  if (hideDurationSelector) {
    return <>{renderDuration(selectedDuration || event.length, t)}</>;
  }

  return selectedDuration ? (
    <div className="border-default relative mr-5 flex flex-row items-center justify-between rounded-md border">
      {leftVisible && (
        <button onClick={handleLeft} className="absolute bottom-0 left-0 flex">
          <div className="bg-default flex h-9 w-5 items-center justify-end rounded-md">
            <ChevronLeftIcon className="text-subtle h-4 w-4" />
          </div>
          <div className="to-default flex h-9 w-5 bg-linear-to-l from-transparent" />
        </button>
      )}
      <ul
        className="bg-default no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md p-1"
        onScroll={(e) => calculateScroll(e)}
        ref={ref}>
        {durations
          .filter((dur) => state !== "booking" || dur === selectedDuration)
          .map((duration, index) => (
            <li
              data-testId={`multiple-choice-${duration}mins`}
              data-active={selectedDuration === duration ? "true" : "false"}
              key={index}
              aria-label={getDurationAccessibleLabel(duration, t) ?? undefined}
              onClick={() => setSelectedDuration(duration)}
              ref={(el) => (itemRefs.current[duration] = el)}
              className={classNames(
                selectedDuration === duration ? "bg-emphasis" : "hover:text-emphasis",
                "text-default cursor-pointer rounded-[4px] px-3 py-1.5 text-sm leading-tight transition"
              )}>
              <div className="w-max">{renderDuration(duration, t)}</div>
            </li>
          ))}
      </ul>
      {rightVisible && (
        <button onClick={handleRight} className="absolute bottom-0 right-0 flex">
          <div className="to-default flex h-9 w-5 bg-linear-to-r from-transparent" />
          <div className="bg-default flex h-9 w-5 items-center justify-end rounded-md">
            <ChevronRightIcon className="text-subtle h-4 w-4" />
          </div>
        </button>
      )}
    </div>
  ) : null;
};
