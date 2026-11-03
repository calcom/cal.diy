import getLabelValueMapFromResponses from "@calcom/lib/bookings/getLabelValueMapFromResponses";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { Info } from "./Info";

export function UserFieldsResponses(props: { calEvent: CalendarEvent; t: TFunction; isOrganizer?: boolean }) {
  const { t, isOrganizer = false } = props;
  const labelValueMap = getLabelValueMapFromResponses(props.calEvent, isOrganizer);

  if (!labelValueMap) return null;
  return (
    <>
      {Object.keys(labelValueMap).map((key) =>
        labelValueMap[key] !== "" ? (
          <Info
            key={key}
            label={t(key)}
            description={
              typeof labelValueMap[key] === "boolean"
                ? labelValueMap[key]
                  ? t("yes")
                  : t("no")
                : `${labelValueMap[key] ? labelValueMap[key] : ""}`
            }
            withSpacer
            isLabelHTML
          />
        ) : null
      )}
    </>
  );
}
