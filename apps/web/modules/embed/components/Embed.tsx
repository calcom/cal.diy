import { Collapsible, CollapsibleContent } from "@radix-ui/react-collapsible";
import classNames from "classnames";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import type { RefObject, Dispatch, SetStateAction } from "react";
import { createRef, useRef, useState } from "react";
import type { ControlProps } from "react-select";
import { components } from "react-select";
import { shallow } from "zustand/shallow";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { AvailableTimes } from "@calcom/web/modules/bookings/components/AvailableTimes";
import { AvailableTimesHeader } from "@calcom/web/modules/bookings/components/AvailableTimesHeader";
import {
  BookerStoreProvider,
  useInitializeBookerStoreContext,
  useBookerStoreContext,
} from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useInitializeBookerStore } from "@calcom/features/bookings/Booker/store";
import { useEvent, useScheduleForEvent } from "@calcom/web/modules/schedules/hooks/useEvent";
import DatePicker from "@calcom/features/calendars/components/DatePicker";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { TimezoneSelect } from "@calcom/web/modules/timezone/components/TimezoneSelect";
import type { Slot } from "~/schedules/lib/types";
import { useNonEmptyScheduleDays } from "@calcom/web/modules/schedules/hooks/useNonEmptyScheduleDays";
import { useSlotsForDate } from "@calcom/web/modules/schedules/hooks/useSlotsForDate";
import { APP_NAME, DEFAULT_LIGHT_BRAND_COLOR, DEFAULT_DARK_BRAND_COLOR } from "@calcom/lib/constants";
import { weekdayToWeekIndex } from "@calcom/lib/dayjs";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";
import { Select, ColorPicker } from "@calcom/ui/components/form";
import { Label } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { ArrowLeftIcon, SunIcon } from "@coss/ui/icons";
import { HorizontalTabs } from "@calcom/ui/components/navigation";
import { showToast } from "@calcom/ui/components/toast";

import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { EmbedTabName } from "@calcom/features/embed/lib/EmbedTabs";
import { buildCssVarsPerTheme } from "@calcom/features/embed/lib/buildCssVarsPerTheme";
import { EmbedTheme } from "@calcom/features/embed/lib/constants";
import { getDimension } from "@calcom/features/embed/lib/getDimension";
import { useEmbedDialogCtx } from "@calcom/features/embed/lib/hooks/useEmbedDialogCtx";
import { useEmbedParams } from "@calcom/features/embed/lib/hooks/useEmbedParams";
import type {
  EmbedTabs,
  EmbedType,
  EmbedTypes,
  PreviewState,
  EmbedConfig,
} from "@calcom/features/embed/types";

type EventType = RouterOutputs["viewer"]["eventTypes"]["get"]["eventType"] | undefined;
type EmbedDialogProps = {
  types: EmbedTypes;
  tabs: EmbedTabs;
  eventTypeHideOptionDisabled: boolean;
  defaultBrandColor: {
    brandColor: string | null;
    darkBrandColor: string | null;
  } | null;
  noQueryParamMode?: boolean;
};

type GotoStateProps = {
  embedType?: EmbedType | null;
  embedTabName?: string | null;
  embedUrl?: string | null;
  eventId?: string | null;
  namespace?: string | null;
  date?: string | null;
  month?: string | null;
  dialog?: string;
};

const queryParamsForDialog = [
  "embedType",
  "embedTabName",
  "embedUrl",
  "eventId",
  "namespace",
  "date",
  "month",
];

function chooseTimezone({
  timezoneFromBookerStore,
  timezoneFromTimePreferences,
  userSettingsTimezone,
}: {
  timezoneFromBookerStore: string | null;
  timezoneFromTimePreferences: string;
  userSettingsTimezone: string | undefined;
}) {
  // We prefer user's timezone configured in settings at the moment - Might be a better idea to prefer timezoneFromTimePreferences over user settings as the user might be in different timezone
  return timezoneFromBookerStore ?? userSettingsTimezone ?? timezoneFromTimePreferences;
}

function useRouterHelpers() {
  const router = useRouter();
  const searchParams = useCompatSearchParams();
  const pathname = usePathname();

  const goto = (newSearchParams: Record<string, string>) => {
    const newQuery = new URLSearchParams(searchParams.toString());
    newQuery.delete("slug");
    newQuery.delete("pages");
    Object.keys(newSearchParams).forEach((key) => {
      newQuery.set(key, newSearchParams[key]);
    });

    router.push(`${pathname}?${newQuery.toString()}`);
  };

  const removeQueryParams = (queryParams: string[]) => {
    const params = new URLSearchParams(searchParams.toString());

    queryParams.forEach((param) => {
      params.delete(param);
    });

    router.push(`${pathname}?${params.toString()}`);
  };

  return { goto, removeQueryParams };
}

function useEmbedGoto(noQueryParamMode = false) {
  const { goto, removeQueryParams } = useRouterHelpers();
  const { setEmbedState } = useEmbedDialogCtx(noQueryParamMode);

  const gotoState = (props: GotoStateProps) => {
    if (noQueryParamMode) {
      setEmbedState((prev) => ({
        ...prev,
        embedType: props.embedType ?? prev?.embedType ?? null,
        embedTabName: props.embedTabName ?? prev?.embedTabName ?? null,
        embedUrl: props.embedUrl ?? prev?.embedUrl ?? null,
        eventId: props.eventId ?? prev?.eventId ?? null,
        namespace: props.namespace ?? prev?.namespace ?? null,
        date: props.date ?? prev?.date ?? null,
        month: props.month ?? prev?.month ?? null,
      }));
    } else {
      const validQueryParams = Object.fromEntries(
        Object.entries(props).filter(([_, value]) => value !== null) as [string, string][]
      );
      goto(validQueryParams);
    }
  };

  const resetState = () => {
    if (noQueryParamMode) {
      setEmbedState(null);
    } else {
      removeQueryParams(["dialog", ...queryParamsForDialog]);
    }
  };

  const gotoEmbedTypeSelectionState = () => {
    if (noQueryParamMode) {
      setEmbedState((prev) => ({
        ...prev,
        embedType: null,
        embedTabName: null,
        embedUrl: prev?.embedUrl ?? null,
        eventId: prev?.eventId ?? null,
        namespace: prev?.namespace ?? null,
        date: prev?.date ?? null,
        month: prev?.month ?? null,
      }));
    } else {
      removeQueryParams(["embedType", "embedTabName"]);
    }
  };

  return { gotoState, resetState, gotoEmbedTypeSelectionState };
}

const ThemeSelectControl = ({
  children,
  ...props
}: ControlProps<{ value: EmbedTheme; label: string }, false>) => {
  return (
    <components.Control {...props}>
      <SunIcon className="text-subtle mr-2 h-4 w-4" />
      {children}
    </components.Control>
  );
};

const ChooseEmbedTypesDialogContent = ({
  types,
  noQueryParamMode,
}: {
  types: EmbedTypes;
  noQueryParamMode: boolean;
}) => {
  const { t } = useLocale();
  const { gotoState } = useEmbedGoto(noQueryParamMode);
  return (
    <DialogContent className="rounded-lg p-10" type="creation" size="lg">
      <div className="mb-2">
        <h3 className="font-cal text-emphasis mb-2 text-2xl font-semibold leading-none" id="modal-title">
          {t("how_you_want_add_cal_site", { appName: APP_NAME })}
        </h3>
        <div>
          <p className="text-subtle text-sm">{t("choose_ways_put_cal_site", { appName: APP_NAME })}</p>
        </div>
      </div>
      <div className="items-start stack-y-2 md:flex md:stack-y-0">
        {types.map((embed, index) => (
          <button
            className="hover:bg-subtle bg-cal-muted	w-full self-stretch rounded-md border border-transparent p-6 text-left transition hover:rounded-md ltr:mr-4 ltr:last:mr-0 rtl:ml-4 rtl:last:ml-0 lg:w-1/3"
            key={index}
            data-testid={embed.type}
            onClick={() => {
              if (embed.type === "headless") {
                window.open("https://cal.com/help/routing/headless-routing", "_blank");
              } else {
                gotoState({
                  embedType: embed.type as EmbedType,
                });
              }
            }}>
            <div className="bg-default order-0 box-border flex-none rounded-md border border-solid transition dark:bg-transparent dark:invert">
              {embed.illustration}
            </div>
            <div className="text-emphasis mt-4 font-semibold">{embed.title}</div>
            <p className="text-subtle mt-2 text-sm">{embed.subtitle}</p>
          </button>
        ))}
      </div>
    </DialogContent>
  );
};

const EmailEmbed = ({
  eventType,
  username,
  orgSlug,
  isTeamEvent,
  selectedDuration,
  setSelectedDuration,
  userSettingsTimezone,
}: {
  eventType?: EventType;
  username: string;
  orgSlug?: string;
  isTeamEvent: boolean;
  selectedDuration: number | undefined;
  setSelectedDuration: Dispatch<SetStateAction<number | undefined>>;
  userSettingsTimezone?: string;
}) => {
  const { t, i18n } = useLocale();
  const { timezoneFromBookerStore, timezoneFromTimePreferences } = useBookerTime();
  const timezone = chooseTimezone({
    timezoneFromBookerStore,
    timezoneFromTimePreferences,
    userSettingsTimezone,
  });

  useInitializeBookerStore({
    username,
    eventSlug: eventType?.slug ?? "",
    eventId: eventType?.id,
    layout: BookerLayouts.MONTH_VIEW,
    org: orgSlug,
    isTeamEvent,
  });
  useInitializeBookerStoreContext({
    username,
    eventSlug: eventType?.slug ?? "",
    eventId: eventType?.id,
    layout: BookerLayouts.MONTH_VIEW,
    org: orgSlug,
    isTeamEvent,
  });

  const [month, selectedDate, selectedDatesAndTimes] = useBookerStoreContext(
    (state) => [state.month, state.selectedDate, state.selectedDatesAndTimes],
    shallow
  );
  const [setSelectedDate, setMonth, setSelectedDatesAndTimes, setSelectedTimeslot, setTimezone] =
    useBookerStoreContext(
      (state) => [
        state.setSelectedDate,
        state.setMonth,
        state.setSelectedDatesAndTimes,
        state.setSelectedTimeslot,
        state.setTimezone,
      ],
      shallow
    );
  const event = useEvent();
  const schedule = useScheduleForEvent({
    orgSlug,
    eventId: eventType?.id,
    isTeamEvent,
    duration: selectedDuration,
    useApiV2: false,
  });
  const nonEmptyScheduleDays = useNonEmptyScheduleDays(schedule?.data?.slots);

  const handleSlotClick = (slot: Slot) => {
    const { time } = slot;
    if (!eventType) {
      return null;
    }
    if (selectedDatesAndTimes && selectedDatesAndTimes[eventType.slug]) {
      const selectedDatesAndTimesForEvent = selectedDatesAndTimes[eventType.slug];
      const selectedSlots = selectedDatesAndTimesForEvent[selectedDate as string] ?? [];
      if (selectedSlots?.includes(time)) {
        // Checks whether a user has removed all their timeSlots and thus removes it from the selectedDatesAndTimesForEvent state
        if (selectedSlots?.length > 1) {
          const updatedDatesAndTimes = {
            ...selectedDatesAndTimes,
            [eventType.slug]: {
              ...selectedDatesAndTimesForEvent,
              [selectedDate as string]: selectedSlots?.filter((slot: string) => slot !== time),
            },
          };

          setSelectedDatesAndTimes(updatedDatesAndTimes);
        } else {
          const updatedDatesAndTimesForEvent = {
            ...selectedDatesAndTimesForEvent,
          };
          delete updatedDatesAndTimesForEvent[selectedDate as string];
          setSelectedTimeslot(null);
          setSelectedDatesAndTimes({
            ...selectedDatesAndTimes,
            [eventType.slug]: updatedDatesAndTimesForEvent,
          });
        }
        return;
      }

      const updatedDatesAndTimes = {
        ...selectedDatesAndTimes,
        [eventType.slug]: {
          ...selectedDatesAndTimesForEvent,
          [selectedDate as string]: [...selectedSlots, time],
        },
      };

      setSelectedDatesAndTimes(updatedDatesAndTimes);
    } else if (!selectedDatesAndTimes) {
      setSelectedDatesAndTimes({
        [eventType.slug]: { [selectedDate as string]: [time] },
      });
    } else {
      setSelectedDatesAndTimes({
        ...selectedDatesAndTimes,
        [eventType.slug]: { [selectedDate as string]: [time] },
      });
    }

    setSelectedTimeslot(time);
  };

  const slots = useSlotsForDate(selectedDate, schedule?.data?.slots);

  if (!eventType) {
    return null;
  }
  if (!selectedDuration) {
    setSelectedDuration(eventType.length);
  }

  const multipleDurations = eventType?.metadata?.multipleDuration ?? [];
  const durationsOptions = multipleDurations.map((duration) => ({
    label: `${duration} ${t("minutes")}`,
    value: duration,
  }));

  return (
    <div className="flex flex-col">
      <div className="mb-[9px] font-medium">
        <Collapsible open>
          <CollapsibleContent>
            <div className="text-default text-sm">{t("select_date")}</div>
            <DatePicker
              isLoading={schedule.isPending}
              onChange={(date: Dayjs | null) => {
                setSelectedDate({
                  date: date === null ? date : date.format("YYYY-MM-DD"),
                });
              }}
              onMonthChange={(date: Dayjs) => {
                setMonth(date.format("YYYY-MM"));
                setSelectedDate({ date: date.format("YYYY-MM-DD") });
              }}
              includedDates={nonEmptyScheduleDays}
              locale={i18n.language}
              browsingDate={month ? dayjs(month) : undefined}
              selected={dayjs(selectedDate)}
              weekStart={weekdayToWeekIndex(event?.data?.subsetOfUsers?.[0]?.weekStart)}
              eventSlug={eventType?.slug}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
      {selectedDate ? (
        <div className="mt-[9px] font-medium ">
          {selectedDate ? (
            <div className="flex h-full w-full flex-col gap-4">
              <AvailableTimesHeader date={dayjs(selectedDate)} />
              <AvailableTimes
                className="w-full"
                selectedSlots={
                  eventType.slug &&
                  selectedDatesAndTimes &&
                  selectedDatesAndTimes[eventType.slug] &&
                  selectedDatesAndTimes[eventType.slug][selectedDate as string]
                    ? selectedDatesAndTimes[eventType.slug][selectedDate as string]
                    : undefined
                }
                handleSlotClick={handleSlotClick}
                slots={slots}
                showAvailableSeatsCount={eventType.seatsShowAvailabilityCount}
                event={event}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-[9px] font-medium ">
        <Collapsible open>
          <CollapsibleContent>
            <div className="text-default mb-[9px] text-sm">{t("duration")}</div>
            {durationsOptions.length > 0 ? (
              <Select<{ label: string; value: number }>
                value={durationsOptions.find((option) => option.value === selectedDuration)}
                options={durationsOptions}
                onChange={(option) => {
                  setSelectedDuration(option?.value);
                  setSelectedDatesAndTimes({});
                }}
              />
            ) : (
              <TextField
                disabled
                label={t("duration")}
                defaultValue={eventType?.length ?? 15}
                addOnSuffix={<>{t("minutes")}</>}
              />
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <div className="mb-[9px] font-medium ">
        <Collapsible open>
          <CollapsibleContent>
            <div className="text-default mb-[9px] text-sm">{t("timezone")}</div>
            <TimezoneSelect id="timezone" value={timezone} onChange={({ value }) => setTimezone(value)} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

const EmailEmbedPreview = ({
  eventType,
  emailContentRef,
  username,
  month,
  selectedDateAndTime,
  calLink,
  selectedDuration,
  userSettingsTimezone,
}: {
  eventType: EventType;
  emailContentRef: RefObject<HTMLDivElement>;
  username?: string;
  month?: string;
  selectedDateAndTime: { [key: string]: string[] };
  calLink: string;
  selectedDuration: number | undefined;
  userSettingsTimezone?: string;
}) => {
  const { t } = useLocale();
  const { timeFormat, timezoneFromBookerStore, timezoneFromTimePreferences } = useBookerTime();
  const timezone = chooseTimezone({
    timezoneFromBookerStore,
    timezoneFromTimePreferences,
    userSettingsTimezone,
  });

  if (!eventType) {
    return null;
  }
  return (
    <div className="flex h-full items-center justify-center border p-5 last:font-medium">
      <div className="border bg-white p-4">
        <div
          style={{
            paddingBottom: "3px",
            fontSize: "13px",
            color: "black",
            lineHeight: "1.4",
            minWidth: "30vw",
            maxHeight: "50vh",
            overflowY: "auto",
            backgroundColor: "white",
          }}
          ref={emailContentRef}>
          <div
            style={{
              fontStyle: "normal",
              fontSize: "20px",
              fontWeight: "bold",
              lineHeight: "19px",
              marginTop: "15px",
              marginBottom: "15px",
            }}>
            <b style={{ color: "black" }}> {eventType.title}</b>
          </div>
          <div
            style={{
              fontStyle: "normal",
              fontWeight: "normal",
              fontSize: "14px",
              lineHeight: "17px",
              color: "#333333",
            }}>
            {t("duration")}: <b style={{ color: "black" }}>{selectedDuration} mins</b>
          </div>
          <div>
            <b style={{ color: "black" }}>
              <span
                style={{
                  fontStyle: "normal",
                  fontWeight: "normal",
                  fontSize: "14px",
                  lineHeight: "17px",
                  color: "#333333",
                }}>
                {t("timezone")}: <b style={{ color: "black" }}>{timezone}</b>
              </span>
            </b>
          </div>
          <b style={{ color: "black" }}>
            <>
              {selectedDateAndTime &&
                Object.keys(selectedDateAndTime)
                  .sort()
                  .map((key) => {
                    const sortedTimes = [...selectedDateAndTime[key]].sort();
                    const firstSlotOfSelectedDay = sortedTimes[0];
                    const selectedDate = dayjs(firstSlotOfSelectedDay)
                      .tz(timezone)
                      .format("dddd, MMMM D, YYYY");
                    return (
                      <table
                        key={key}
                        style={{
                          marginTop: "16px",
                          textAlign: "left",
                          borderCollapse: "collapse",
                          borderSpacing: "0px",
                        }}>
                        <tbody>
                          <tr>
                            <td style={{ textAlign: "left", marginTop: "16px" }}>
                              <span
                                style={{
                                  fontSize: "14px",
                                  lineHeight: "16px",
                                  paddingBottom: "8px",
                                  color: "rgb(26, 26, 26)",
                                  fontWeight: "bold",
                                }}>
                                {selectedDate}
                                &nbsp;
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <table
                                style={{
                                  borderCollapse: "separate",
                                  borderSpacing: "0px 4px",
                                }}>
                                <tbody>
                                  <tr style={{ height: "25px" }}>
                                    {sortedTimes?.length > 0 &&
                                      sortedTimes.map((time) => {
                                        // If teamId is present on eventType and is not null, it means it is a team event.
                                        // So we add 'team/' to the url.
                                        const bookingURL = `${eventType.bookerUrl}/${
                                          eventType.teamId !== null ? "team/" : ""
                                        }${username}/${
                                          eventType.slug
                                        }?duration=${selectedDuration}&date=${key}&month=${month}&slot=${time}&cal.tz=${timezone}`;
                                        return (
                                          <td
                                            key={time}
                                            style={{
                                              padding: "0px",
                                              width: "64px",
                                              display: "inline-block",
                                              marginRight: "4px",
                                              marginBottom: "4px",
                                              height: "24px",
                                              border: "1px solid #111827",
                                              borderRadius: "3px",
                                            }}>
                                            <table style={{ height: "21px" }}>
                                              <tbody>
                                                <tr style={{ height: "21px" }}>
                                                  <td style={{ width: "7px" }} />
                                                  <td
                                                    style={{
                                                      width: "50px",
                                                      textAlign: "center",
                                                      marginRight: "1px",
                                                    }}>
                                                    <a
                                                      href={bookingURL}
                                                      className="spot"
                                                      style={{
                                                        fontFamily: '"Proxima Nova", sans-serif',
                                                        textDecoration: "none",
                                                        textAlign: "center",
                                                        color: "#111827",
                                                        fontSize: "12px",
                                                        lineHeight: "16px",
                                                      }}>
                                                      <b
                                                        style={{
                                                          fontWeight: "normal",
                                                          textDecoration: "none",
                                                        }}>
                                                        {dayjs.utc(time).tz(timezone).format(timeFormat)}
                                                        &nbsp;
                                                      </b>
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        );
                                      })}
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    );
                  })}
              <div style={{ marginTop: "13px" }}>
                <a
                  className="more"
                  data-testid="see_all_available_times"
                  href={`${eventType.bookerUrl}/${calLink}?cal.tz=${timezone}`}
                  style={{
                    textDecoration: "none",
                    cursor: "pointer",
                    color: "black",
                  }}>
                  {t("see_all_available_times")}
                </a>
              </div>
            </>
          </b>
          <div
            className="w-full text-right"
            style={{
              borderTop: "1px solid #CCCCCC",
              marginTop: "8px",
              paddingTop: "8px",
            }}>
            <span>{t("powered_by")}</span>{" "}
            <b style={{ color: "black" }}>
              <span> Cal.diy</span>
            </b>
          </div>
        </div>
        <b style={{ color: "black" }} />
      </div>
    </div>
  );
};

const EmbedTypeCodeAndPreviewDialogContent = ({
  embedType,
  embedUrl,
  tabs,
  namespace,
  eventTypeHideOptionDisabled,
  types,
  defaultBrandColor,
  noQueryParamMode,
}: EmbedDialogProps & {
  embedType: EmbedType;
  embedUrl: string;
  namespace: string;
  noQueryParamMode?: boolean;
}) => {
  const { t } = useLocale();
  const searchParams = useCompatSearchParams();
  const pathname = usePathname();
  const { resetState, gotoState, gotoEmbedTypeSelectionState } = useEmbedGoto(noQueryParamMode);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const emailContentRef = useRef<HTMLDivElement>(null);
  const { data } = useSession();

  const [month, selectedDatesAndTimes] = useBookerStoreContext(
    (state) => [state.month, state.selectedDatesAndTimes],
    shallow
  );

  const embedParams = useEmbedParams(noQueryParamMode);
  const eventId = embedParams.eventId;
  const parsedEventId = parseInt(eventId ?? "", 10);
  const calLink = decodeURIComponent(embedUrl);
  const { data: eventTypeData } = trpc.viewer.eventTypes.get.useQuery(
    { id: parsedEventId },
    {
      enabled: !Number.isNaN(parsedEventId) && embedType === "email",
      refetchOnWindowFocus: false,
    }
  );
  const { data: userSettings } = trpc.viewer.me.get.useQuery();

  const teamSlug = eventTypeData?.team ? eventTypeData.team.slug : null;

  const s = (href: string) => {
    const _searchParams = new URLSearchParams(searchParams.toString());
    const [a, b] = href.split("=");
    _searchParams.set(a, b);
    return `${pathname?.split("?")[0] ?? ""}?${_searchParams.toString()}`;
  };
  const parsedTabs = tabs.map((t) => {
    const { href, ...rest } = t;
    const tabName = href.split("=")[1];
    return {
      ...rest,
      isActive: tabName === embedParams.embedTabName,
      ...(noQueryParamMode
        ? {
            onClick: () => {
              gotoState({ embedTabName: tabName });
            },
            // We still pass the href(which is unique) so that all the tabs aren't marked as active
            href: t.href,
          }
        : {
            href: s(t.href),
          }),
    };
  });
  const embedCodeRefs: Record<(typeof tabs)[0]["name"], RefObject<HTMLTextAreaElement>> = {};
  tabs
    .filter((tab) => tab.type === "code")
    .forEach((codeTab) => {
      embedCodeRefs[codeTab.name] = createRef();
    });

  const refOfEmbedCodesRefs = useRef(embedCodeRefs);
  const embed = types.find((embed) => embed.type === embedType);
  const [selectedDuration, setSelectedDuration] = useState(eventTypeData?.eventType.length);

  const [isEmbedCustomizationOpen, setIsEmbedCustomizationOpen] = useState(true);
  const [isBookingCustomizationOpen, setIsBookingCustomizationOpen] = useState(true);
  const defaultConfig = {
    layout: BookerLayouts.MONTH_VIEW,
    useSlotsViewOnSmallScreen: "true" as const,
  };

  const paletteDefaultValue = (paletteName: string) => {
    if (paletteName === "brandColor") {
      return defaultBrandColor?.brandColor ?? DEFAULT_LIGHT_BRAND_COLOR;
    }

    if (paletteName === "darkBrandColor") {
      return defaultBrandColor?.darkBrandColor ?? DEFAULT_DARK_BRAND_COLOR;
    }

    return "#000000";
  };

  const [previewState, setPreviewState] = useState<PreviewState>({
    inline: {
      width: "100%",
      height: "100%",
      config: defaultConfig,
    } as PreviewState["inline"],
    theme: EmbedTheme.auto,
    layout: defaultConfig.layout,
    floatingPopup: {
      config: defaultConfig,
    } as PreviewState["floatingPopup"],
    elementClick: {
      config: defaultConfig,
    } as PreviewState["elementClick"],
    hideEventTypeDetails: false,
    palette: {
      brandColor: defaultBrandColor?.brandColor ?? null,
      darkBrandColor: defaultBrandColor?.darkBrandColor ?? null,
    },
  });

  const close = () => {
    resetState();
  };

  // Use embed-code as default tab
  if (!embedParams.embedTabName) {
    gotoState({
      embedTabName: "embed-code",
    });
  }

  if (!embed || !embedUrl) {
    close();
    return null;
  }

  const addToPalette = (update: Partial<(typeof previewState)["palette"]>) => {
    setPreviewState((previewState) => {
      return {
        ...previewState,
        palette: {
          ...previewState.palette,
          ...update,
        },
      };
    });
  };

  const previewInstruction = (instruction: { name: string; arg: unknown }) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        mode: "cal:preview",
        type: "instruction",
        instruction,
      },
      "*"
    );
  };

  const inlineEmbedDimensionUpdate = ({ width, height }: { width: string; height: string }) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        mode: "cal:preview",
        type: "inlineEmbedDimensionUpdate",
        data: {
          width: getDimension(width),
          height: getDimension(height),
        },
      },
      "*"
    );
  };

  previewInstruction({
    name: "ui",
    arg: {
      theme: previewState.theme,
      layout: previewState.layout,
      hideEventTypeDetails: previewState.hideEventTypeDetails,
      cssVarsPerTheme: buildCssVarsPerTheme({
        brandColor: previewState.palette.brandColor,
        darkBrandColor: previewState.palette.darkBrandColor,
      }),
    },
  });

  const handleCopyEmailText = () => {
    const contentElement = emailContentRef.current;
    if (contentElement !== null) {
      const range = document.createRange();
      range.selectNode(contentElement);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        selection.removeAllRanges();
      }

      showToast(t("code_copied"), "success");
    }
  };

  if (embedType === "floating-popup") {
    previewInstruction({
      name: "floatingButton",
      arg: {
        attributes: {
          id: "my-floating-button",
        },
        ...previewState.floatingPopup,
      },
    });
  }

  if (embedType === "inline") {
    inlineEmbedDimensionUpdate({
      width: previewState.inline.width,
      height: previewState.inline.height,
    });
  }

  const ThemeOptions = [
    { value: EmbedTheme.auto, label: "Auto" },
    { value: EmbedTheme.dark, label: "Dark Theme" },
    { value: EmbedTheme.light, label: "Light Theme" },
  ];

  const layoutOptions = [
    { value: BookerLayouts.MONTH_VIEW, label: t("bookerlayout_month_view") },
    { value: BookerLayouts.WEEK_VIEW, label: t("bookerlayout_week_view") },
    { value: BookerLayouts.COLUMN_VIEW, label: t("bookerlayout_column_view") },
  ];

  const FloatingPopupPositionOptions = [
    {
      value: "bottom-right" as const,
      label: "Bottom right",
    },
    {
      value: "bottom-left" as const,
      label: "Bottom left",
    },
  ];
  const previewTab = tabs.find((tab) => tab.name === "Preview");

  return (
    <DialogContent
      enableOverflow
      ref={dialogContentRef}
      className="rounded-lg p-0.5 sm:max-w-7xl!"
      type="creation">
      <div className="flex">
        <div className="bg-cal-muted flex h-[95vh] w-1/3 flex-col overflow-y-auto p-8">
          <h3
            className="text-emphasis mb-2.5 flex items-center text-xl font-semibold leading-5"
            id="modal-title">
            <button className="h-6 w-6" onClick={gotoEmbedTypeSelectionState}>
              <ArrowLeftIcon className="mr-4 w-4" />
            </button>
            {embed.title}
          </h3>
          <h4 className="text-subtle mb-6 text-sm font-normal">{embed.subtitle}</h4>
          {eventTypeData?.eventType && embedType === "email" ? (
            <EmailEmbed
              eventType={eventTypeData?.eventType}
              username={teamSlug ?? (data?.user.username as string)}
              userSettingsTimezone={userSettings?.timeZone}
              orgSlug={data?.user?.org?.slug}
              isTeamEvent={!!teamSlug}
              selectedDuration={selectedDuration}
              setSelectedDuration={setSelectedDuration}
            />
          ) : (
            <div className="flex flex-col">
              <div className={classNames("font-medium", embedType === "element-click" ? "hidden" : "")}>
                <Collapsible
                  open={isEmbedCustomizationOpen}
                  onOpenChange={() => setIsEmbedCustomizationOpen((val) => !val)}>
                  <CollapsibleContent className="text-sm">
                    {/* Conditionally render Window Sizing only if inline embed AND NOT React Atom */}
                    {embedType === "inline" && embedParams.embedTabName !== EmbedTabName.ATOM_REACT && (
                      <div>
                        {/*TODO: Add Auto/Fixed toggle from Figma */}
                        <div className="text-default mb-[9px] text-sm">Window sizing</div>
                        <div className="justify-left mb-6 flex items-center font-normal! ">
                          <div className="mr-[9px]">
                            <TextField
                              labelProps={{ className: "hidden" }}
                              className="focus:ring-offset-0"
                              required
                              value={previewState.inline.width}
                              onChange={(e) => {
                                setPreviewState((previewState) => {
                                  const width = e.target.value || "100%";

                                  return {
                                    ...previewState,
                                    inline: {
                                      ...previewState.inline,
                                      width,
                                    },
                                  };
                                });
                              }}
                              addOnLeading={<>W</>}
                            />
                          </div>

                          <TextField
                            labelProps={{ className: "hidden" }}
                            className="focus:ring-offset-0"
                            value={previewState.inline.height}
                            required
                            onChange={(e) => {
                              const height = e.target.value || "100%";

                              setPreviewState((previewState) => {
                                return {
                                  ...previewState,
                                  inline: {
                                    ...previewState.inline,
                                    height,
                                  },
                                };
                              });
                            }}
                            addOnLeading={<>H</>}
                          />
                        </div>
                      </div>
                    )}
                    <div
                      className={classNames(
                        "items-center justify-between",
                        embedType === "floating-popup" ? "text-emphasis" : "hidden"
                      )}>
                      <div className="mb-2 text-sm">Button text</div>
                      {/* Default Values should come from preview iframe */}
                      <TextField
                        labelProps={{ className: "hidden" }}
                        onChange={(e) => {
                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              floatingPopup: {
                                ...previewState.floatingPopup,
                                buttonText: e.target.value,
                              },
                            };
                          });
                        }}
                        defaultValue={t("book_my_cal")}
                        required
                      />
                    </div>
                    <div
                      className={classNames(
                        "mt-4 flex items-center justify-start",
                        embedType === "floating-popup"
                          ? "text-emphasis space-x-2 rtl:space-x-reverse"
                          : "hidden"
                      )}>
                      <Switch
                        defaultChecked={true}
                        onCheckedChange={(checked) => {
                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              floatingPopup: {
                                ...previewState.floatingPopup,
                                hideButtonIcon: !checked,
                              },
                            };
                          });
                        }}
                      />
                      <div className="text-default my-2 text-sm">Display calendar icon</div>
                    </div>
                    <div
                      className={classNames(
                        "mt-4 items-center justify-between",
                        embedType === "floating-popup" ? "text-emphasis" : "hidden"
                      )}>
                      <div className="mb-2">Position of button</div>
                      <Select
                        onChange={(position) => {
                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              floatingPopup: {
                                ...previewState.floatingPopup,
                                buttonPosition: position?.value,
                              },
                            };
                          });
                        }}
                        defaultValue={FloatingPopupPositionOptions[0]}
                        options={FloatingPopupPositionOptions}
                      />
                    </div>
                    <div className="mt-3 flex flex-col xl:flex-row xl:justify-between">
                      <div className={classNames("mt-4", embedType === "floating-popup" ? "" : "hidden")}>
                        <div className="whitespace-nowrap">Button color</div>
                        <div className="mt-2 w-40 xl:mt-0 xl:w-full">
                          <ColorPicker
                            className="w-[130px]"
                            popoverAlign="start"
                            container={dialogContentRef?.current ?? undefined}
                            defaultValue="#000000"
                            onChange={(color) => {
                              setPreviewState((previewState) => {
                                return {
                                  ...previewState,
                                  floatingPopup: {
                                    ...previewState.floatingPopup,
                                    buttonColor: color,
                                  },
                                };
                              });
                            }}
                          />
                        </div>
                      </div>
                      <div className={classNames("mt-4", embedType === "floating-popup" ? "" : "hidden")}>
                        <div className="whitespace-nowrap">Text color</div>
                        <div className="mb-6 mt-2 w-40 xl:mt-0 xl:w-full">
                          <ColorPicker
                            className="w-[130px]"
                            popoverAlign="start"
                            container={dialogContentRef?.current ?? undefined}
                            defaultValue="#000000"
                            onChange={(color) => {
                              setPreviewState((previewState) => {
                                return {
                                  ...previewState,
                                  floatingPopup: {
                                    ...previewState.floatingPopup,
                                    buttonTextColor: color,
                                  },
                                };
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <div className="font-medium">
                <Collapsible
                  open={isBookingCustomizationOpen}
                  onOpenChange={() => setIsBookingCustomizationOpen((val) => !val)}>
                  <CollapsibleContent>
                    <div className="text-sm">
                      {/* Conditionally render EmbedTheme only if NOT React Atom */}
                      {embedParams.embedTabName !== EmbedTabName.ATOM_REACT && (
                        <Label className="mb-6">
                          <div className="mb-2">Embed theme</div>
                          <Select
                            className="w-full"
                            defaultValue={ThemeOptions[0]}
                            components={{
                              Control: ThemeSelectControl,
                              IndicatorSeparator: () => null,
                            }}
                            onChange={(option) => {
                              if (!option) {
                                return;
                              }
                              setPreviewState((previewState) => {
                                // Ensure theme is updated in config for all embed types
                                const newConfig = (currentConfig?: EmbedConfig) => ({
                                  ...(currentConfig ?? {}),
                                  theme: option.value,
                                });
                                return {
                                  ...previewState,
                                  inline: {
                                    ...previewState.inline,
                                    config: newConfig(previewState.inline.config),
                                  },
                                  floatingPopup: {
                                    ...previewState.floatingPopup,
                                    config: newConfig(previewState.floatingPopup.config),
                                  },
                                  elementClick: {
                                    ...previewState.elementClick,
                                    config: newConfig(previewState.elementClick.config),
                                  },
                                  // Keep updating top-level theme for preview iframe
                                  theme: option.value,
                                };
                              });
                            }}
                            options={ThemeOptions}
                          />
                        </Label>
                      )}
                      {/* Conditionally render Hide Details Switch only if NOT Atom embed AND not disabled by prop */}
                      {!eventTypeHideOptionDisabled &&
                      embedParams.embedTabName !== EmbedTabName.ATOM_REACT ? (
                        <div className="mb-6 flex items-center justify-start space-x-2 rtl:space-x-reverse">
                          <Switch
                            checked={previewState.hideEventTypeDetails}
                            onCheckedChange={(checked) => {
                              setPreviewState((previewState) => {
                                return {
                                  ...previewState,
                                  hideEventTypeDetails: checked,
                                };
                              });
                            }}
                          />
                          <div className="text-default text-sm">{t("hide_eventtype_details")}</div>
                        </div>
                      ) : null}
                      {/* Conditionally render Brand Colors only if NOT React Atom */}
                      {embedParams.embedTabName !== EmbedTabName.ATOM_REACT &&
                        [
                          { name: "brandColor", title: "light_brand_color" },
                          { name: "darkBrandColor", title: "dark_brand_color" },
                          // { name: "lightColor", title: "Light Color" },
                          // { name: "lighterColor", title: "Lighter Color" },
                          // { name: "lightestColor", title: "Lightest Color" },
                          // { name: "highlightColor", title: "Highlight Color" },
                          // { name: "medianColor", title: "Median Color" },
                        ].map((palette) => (
                          <Label key={palette.name} className="mb-6">
                            <div className="mb-2">{t(palette.title)}</div>
                            <div className="w-full">
                              <ColorPicker
                                popoverAlign="start"
                                container={dialogContentRef?.current ?? undefined}
                                defaultValue={paletteDefaultValue(palette.name)}
                                onChange={(color) => {
                                  addToPalette({
                                    [palette.name as keyof (typeof previewState)["palette"]]: color,
                                  });
                                }}
                              />
                            </div>
                          </Label>
                        ))}
                      <Label className="mb-6">
                        <div className="mb-2">{t("layout")}</div>
                        <Select
                          className="w-full"
                          defaultValue={layoutOptions[0]}
                          onChange={(option) => {
                            if (!option) {
                              return;
                            }
                            setPreviewState((previewState) => {
                              // Ensure layout is updated in config for all embed types
                              const newConfig = (currentConfig?: EmbedConfig) => ({
                                ...(currentConfig ?? {}),
                                layout: option.value,
                              });
                              return {
                                ...previewState,
                                inline: {
                                  ...previewState.inline,
                                  config: newConfig(previewState.inline.config),
                                },
                                floatingPopup: {
                                  ...previewState.floatingPopup,
                                  config: newConfig(previewState.floatingPopup.config),
                                },
                                elementClick: {
                                  ...previewState.elementClick,
                                  config: newConfig(previewState.elementClick.config),
                                },
                                // Keep updating top-level layout for preview iframe
                                layout: option.value,
                              };
                            });
                          }}
                          options={layoutOptions}
                        />
                      </Label>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}
        </div>
        <div className="flex h-[95vh] w-2/3 flex-col px-8 pt-8">
          <HorizontalTabs
            data-testid="embed-tabs"
            tabs={
              embedType === "email"
                ? parsedTabs.filter((tab) => tab.name === "Preview")
                : parsedTabs.filter((tab) => tab.name !== "Preview")
            }
            linkShallow
          />
          <>
            <div className="flex h-full flex-col">
              {tabs.map((tab) => {
                if (embedType !== "email") {
                  if (tab.name === "Preview") return null;
                  return (
                    <div
                      key={tab.href}
                      className={classNames(
                        embedParams.embedTabName === tab.href.split("=")[1] ? "flex-1" : "hidden"
                      )}>
                      {tab.type === "code" && (
                        <tab.Component
                          namespace={namespace}
                          embedType={embedType}
                          calLink={calLink}
                          previewState={previewState}
                          ref={refOfEmbedCodesRefs.current[tab.name]}
                        />
                      )}
                      <div
                        className={embedParams.embedTabName === "embed-preview" ? "mt-2 block" : "hidden"}
                      />
                    </div>
                  );
                }

                if (embedType === "email" && (tab.name !== "Preview" || !eventTypeData?.eventType)) return;

                return (
                  <div key={tab.href} className={classNames("flex grow flex-col")}>
                    <div className="flex h-[55vh] grow flex-col">
                      <EmailEmbedPreview
                        selectedDuration={selectedDuration}
                        calLink={calLink}
                        eventType={eventTypeData?.eventType}
                        emailContentRef={emailContentRef}
                        username={teamSlug ?? (data?.user.username as string)}
                        userSettingsTimezone={userSettings?.timeZone}
                        month={month as string}
                        selectedDateAndTime={
                          selectedDatesAndTimes
                            ? selectedDatesAndTimes[eventTypeData?.eventType.slug as string]
                            : {}
                        }
                      />
                    </div>
                    <div className={embedParams.embedTabName === "embed-preview" ? "mt-2 block" : "hidden"} />
                  </div>
                );
              })}

              {embedType !== "email" && previewTab && (
                <div className="flex-1">
                  <previewTab.Component
                    namespace={namespace}
                    embedType={embedType}
                    calLink={calLink}
                    previewState={previewState}
                    ref={iframeRef}
                  />
                </div>
              )}
            </div>
            <DialogFooter className="mt-10 flex-row-reverse gap-x-2" showDivider>
              <DialogClose />
              <Button
                type="submit"
                onClick={() => {
                  if (embedType === "email") {
                    handleCopyEmailText();
                  } else {
                    const currentTabHref = embedParams.embedTabName;
                    const currentTabName = tabs.find(
                      (tab) => tab.href === `embedTabName=${currentTabHref}`
                    )?.name;
                    if (!currentTabName) return;
                    const currentTabCodeEl = refOfEmbedCodesRefs.current[currentTabName].current;
                    if (!currentTabCodeEl) {
                      return;
                    }
                    navigator.clipboard.writeText(currentTabCodeEl.value);
                    showToast(t("code_copied"), "success");
                  }
                }}>
                {embedType === "email" ? t("copy") : t("copy_code")}
              </Button>
            </DialogFooter>
          </>
        </div>
      </div>
    </DialogContent>
  );
};

export const EmbedDialog = ({
  types,
  tabs,
  eventTypeHideOptionDisabled,
  defaultBrandColor,
  noQueryParamMode = false,
}: EmbedDialogProps) => {
  const { embedState, setEmbedState } = useEmbedDialogCtx(noQueryParamMode);
  const embedParams = useEmbedParams(noQueryParamMode);

  const handleDialogClose = () => {
    if (noQueryParamMode) {
      setEmbedState(null);
    }
  };

  return (
    <BookerStoreProvider>
      <Dialog
        {...(noQueryParamMode
          ? {
              open: embedState !== null,
              onOpenChange: (open) => !open && handleDialogClose(),
            }
          : {
              // Must not set name when noQueryParam mode as required by Dialog component
              name: "embed",
              clearQueryParamsOnClose: queryParamsForDialog,
            })}>
        {!embedParams.embedType ? (
          <ChooseEmbedTypesDialogContent types={types} noQueryParamMode={noQueryParamMode} />
        ) : (
          <EmbedTypeCodeAndPreviewDialogContent
            embedType={embedParams.embedType as EmbedType}
            embedUrl={embedParams.embedUrl}
            namespace={embedParams.namespace}
            tabs={tabs}
            types={types}
            eventTypeHideOptionDisabled={eventTypeHideOptionDisabled}
            defaultBrandColor={defaultBrandColor}
            noQueryParamMode={noQueryParamMode}
          />
        )}
      </Dialog>
    </BookerStoreProvider>
  );
};

type EmbedButtonProps<T> = {
  embedUrl: string;
  namespace: string;
  children?: React.ReactNode;
  className?: string;
  as?: T;
  eventId?: number;
  noQueryParamMode?: boolean;
};

export const EmbedButton = <T extends React.ElementType = typeof Button>({
  embedUrl,
  children,
  className = "",
  as,
  eventId,
  namespace,
  noQueryParamMode,
  ...props
}: EmbedButtonProps<T> & React.ComponentPropsWithoutRef<T>) => {
  const { gotoState } = useEmbedGoto(noQueryParamMode);
  className = classNames("hidden lg:inline-flex", className);

  const openEmbedModal = () => {
    gotoState({
      dialog: "embed",
      eventId: eventId ? eventId.toString() : "",
      namespace,
      embedUrl,
    });
  };
  const Component = as ?? Button;

  return (
    <Component
      {...props}
      className={className}
      data-test-embed-url={embedUrl}
      data-testid="embed"
      type="button"
      onClick={openEmbedModal}>
      {children}
    </Component>
  );
};
