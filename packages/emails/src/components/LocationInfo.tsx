import { guessEventLocationType } from "@calcom/app-store/locations";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { Info } from "./Info";

export function LocationInfo(props: { calEvent: CalendarEvent; t: TFunction }) {
  const { t } = props;

  // We would not be able to determine provider name for DefaultEventLocationTypes
  const providerName = guessEventLocationType(props.calEvent.location)?.label;

  const location = props.calEvent.location;
  let meetingUrl = location?.search(/^https?:/) !== -1 ? location : undefined;

  if (props.calEvent) {
    meetingUrl = getVideoCallUrlFromCalEvent(props.calEvent) || meetingUrl;
  }

  const isPhone = location?.startsWith("+");

  // Because of location being a value here, we can determine the app that generated the location only for Dynamic Link based apps where the value is integrations:*
  // For static link based location apps, the value is that URL itself. So, it is not straightforward to determine the app that generated the location.
  // If we know the App we can always provide the name of the app like we do it for Google Hangout/Google Meet

  if (meetingUrl) {
    return (
      <Info
        label={t("where")}
        withSpacer
        description={
          <a
            href={meetingUrl}
            target="_blank"
            title={t("meeting_url")}
            style={{ color: "#101010" }}
            rel="noreferrer">
            {providerName || "Link"}
          </a>
        }
        extraInfo={
          meetingUrl && (
            <div style={{ color: "#494949", fontWeight: 400, lineHeight: "24px" }}>
              <>
                {t("meeting_url")}:{" "}
                <a href={meetingUrl} title={t("meeting_url")} style={{ color: "#3E3E3E" }}>
                  {meetingUrl}
                </a>
              </>
            </div>
          )
        }
      />
    );
  }

  if (isPhone) {
    return (
      <Info
        label={t("where")}
        withSpacer
        description={
          <a href={`tel:${location}`} title="Phone" style={{ color: "#3E3E3E" }}>
            {location}
          </a>
        }
      />
    );
  }

  return (
    <Info
      label={t("where")}
      withSpacer
      description={providerName || location}
      extraInfo={
        (providerName === "Zoom" || providerName === "Google") && props.calEvent.requiresConfirmation ? (
          <p style={{ color: "#494949", fontWeight: 400, lineHeight: "24px" }}>
            <>{t("meeting_url_provided_after_confirmed")}</>
          </p>
        ) : null
      }
    />
  );
}
