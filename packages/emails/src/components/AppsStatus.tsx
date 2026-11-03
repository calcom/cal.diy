import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { Info } from "./Info";

export const AppsStatus = (props: { calEvent: CalendarEvent; t: TFunction }) => {
  const { t } = props;
  if (!props.calEvent.appsStatus) return null;
  return (
    <Info
      label={t("apps_status")}
      description={
        <ul style={{ lineHeight: "24px" }} data-testid="appsStatus">
          {props.calEvent.appsStatus.map((status) => (
            <li key={status.type} style={{ fontWeight: 400 }}>
              {status.appName}{" "}
              {status.success >= 1 && `✅ ${status.success > 1 ? `(x${status.success})` : ""}`}
              {status.failures >= 1 && `❌ ${status.failures > 1 ? `(x${status.failures})` : ""}`}
              {status.warnings && status.warnings.length >= 1 && (
                <ul style={{ fontSize: "14px" }}>
                  {status.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              )}
              {status.errors.length >= 1 && (
                <ul>
                  {status.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      }
      withSpacer
    />
  );
};
