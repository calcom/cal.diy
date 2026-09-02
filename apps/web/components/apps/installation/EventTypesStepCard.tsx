import {
  getDurationMinutesAccessibleLabel,
  getDurationMinutesFormatted,
} from "@calcom/lib/formatEventDuration";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { DurationText } from "@calcom/ui/components/duration";
import { ScrollableArea } from "@calcom/ui/components/scrollable";
import type { Dispatch, FC, SetStateAction } from "react";
import React from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { TEventType, TEventTypeGroup, TEventTypesForm } from "~/apps/installation/[[...step]]/step-view";

type EventTypesCardProps = {
  userName: string;
  setConfigureStep: Dispatch<SetStateAction<boolean>>;
  handleSetUpLater: () => void;
};

type EventTypeGroupProps = { groupIndex: number; userName: string } & TEventTypeGroup;

type EventTypeCardProps = TEventType & { userName: string; handleSelect: () => void };

const EventTypeCard: FC<EventTypeCardProps> = ({
  title,
  description,
  id,
  metadata,
  length,
  selected,
  slug,
  handleSelect,
  team,
  userName,
}) => {
  const { t } = useLocale();
  const parsedMetaData = EventTypeMetaDataSchema.safeParse(metadata);
  const multipleDuration =
    parsedMetaData.success && parsedMetaData.data?.multipleDuration
      ? parsedMetaData.data.multipleDuration
      : [];

  const durations =
    multipleDuration.length > 0
      ? [length, ...multipleDuration.filter((duration) => duration !== length)].sort()
      : [length];
  return (
    <div
      data-testid={`select-event-type-${id}`}
      className="hover:bg-cal-muted min-h-20 box-border flex w-full cursor-pointer select-none items-center space-x-4 px-4 py-3"
      onClick={() => handleSelect()}>
      <input
        id={`${id}`}
        checked={selected}
        className="bg-default border-default h-4 w-4 shrink-0 cursor-pointer rounded-cal checked:border-transparent checked:bg-gray-800 border ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        type="checkbox"
      />
      <label htmlFor={`${id}`} className="cursor-pointer text-sm">
        <li>
          <div>
            <span className="text-default font-semibold ltr:mr-1 rtl:ml-1">{title}</span>{" "}
            <small className="text-subtle hidden font-normal sm:inline">
              /{team ? team.slug : userName}/{slug}
            </small>
          </div>
          {Boolean(description) && (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTML
            <div
              className="text-subtle line-clamp-4 wrap-break-word text-sm sm:max-w-[650px] [&>*:not(:first-child)]:hidden [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-600"
              dangerouslySetInnerHTML={{
                __html: markdownToSafeHTML(description),
              }}
            />
          )}
          <div className="mt-2 flex flex-row flex-wrap gap-2">
            {Boolean(durations.length) &&
              durations.map((duration) => (
                <Badge key={`event-type-${id}-duration-${duration}`} variant="gray" startIcon="clock">
                  <DurationText label={getDurationMinutesAccessibleLabel(duration, t) ?? ""}>
                    {getDurationMinutesFormatted(duration, t)}
                  </DurationText>
                </Badge>
              ))}
          </div>
        </li>
      </label>
    </div>
  );
};
const EventTypeGroup: FC<EventTypeGroupProps> = ({ groupIndex, userName, ...props }) => {
  const { t } = useLocale();
  const { control } = useFormContext<TEventTypesForm>();
  const { fields, update } = useFieldArray({
    control,
    name: `eventTypeGroups.${groupIndex}.eventTypes`,
    keyName: "fieldId",
  });

  return (
    <div className="mt-10">
      <div className="mb-2 flex items-center">
        <Avatar
          alt={t("app_icon", { app: props.slug })}
          imageSrc={props.image} // if no image, use default avatar
          size="md"
          className="mt-1 inline-flex justify-center"
        />
        <p className="block pl-2 text-sm">{props.slug}</p>
      </div>

      <div className="sm:border-subtle bg-default  border dark:bg-black sm:rounded-md">
        <ScrollableArea className="rounded-md">
          <ul className="border-subtle max-h-97 static! w-full divide-y">
            {fields.length > 0 ? (
              fields.map((field, index) => (
                <EventTypeCard
                  key={`${field.fieldId}`}
                  handleSelect={() => {
                    update(index, { ...field, selected: !field.selected });
                  }}
                  userName={userName}
                  {...field}
                />
              ))
            ) : (
              <div className="text-subtle bg-cal-muted w-full p-2  text-center text-sm">
                Team has no Events
              </div>
            )}
          </ul>
        </ScrollableArea>
      </div>
    </div>
  );
};

export const EventTypesStepCard: FC<EventTypesCardProps> = ({
  setConfigureStep,
  userName,
  handleSetUpLater,
}) => {
  const { t } = useLocale();
  const { control, watch } = useFormContext<TEventTypesForm>();
  const { fields } = useFieldArray({
    control,
    name: "eventTypeGroups",
    keyName: "fieldId",
  });

  const eventTypeGroups = watch("eventTypeGroups") || [];

  return (
    <div>
      {fields.map(
        (field, index) =>
          !field.isOrganisation && (
            <EventTypeGroup key={field.fieldId} groupIndex={index} userName={userName} {...field} />
          )
      )}

      <Button
        className="text-md mt-6 w-full justify-center"
        data-testid="save-event-types"
        onClick={() => {
          setConfigureStep(true);
        }}
        disabled={
          !eventTypeGroups.some((field) => field.eventTypes.some((eventType) => eventType.selected === true))
        }>
        {t("save")}
      </Button>

      <div className="flex w-full flex-row justify-center">
        <Button
          color="minimal"
          data-testid="set-up-later"
          onClick={(event) => {
            event.preventDefault();
            handleSetUpLater();
          }}
          className="mt-8 cursor-pointer px-4 py-2 font-sans text-sm font-medium">
          {t("set_up_later")}
        </Button>
      </div>
    </div>
  );
};
