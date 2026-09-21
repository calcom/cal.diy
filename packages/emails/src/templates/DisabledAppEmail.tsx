import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export const DisabledAppEmail = (
  props: {
    appName: string;
    appType: string[];
    t: TFunction;
    title?: string;
    eventTypeId?: number;
  } & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const { title, appName, eventTypeId, t, appType } = props;

  return (
    <BaseEmailHtml subject={t("app_disabled", { appName: appName })}>
      {appType.some((type) => type === "payment") ? (
        <>
          <p>
            <>{t("disabled_app_affects_event_type", { appName: appName, eventType: title })}</>
          </p>
          <p style={{ fontWeight: 400, lineHeight: "24px" }}>
            <>{t("payment_disabled_still_able_to_book")}</>
          </p>

          <hr style={{ marginBottom: "24px" }} />

          <CallToAction
            label={t("edit_event_type")}
            href={`${WEBAPP_URL}/event-types/${eventTypeId}?tabName=apps`}
          />
        </>
      ) : title && eventTypeId ? (
        <>
          <p>
            <>{(t("app_disabled_with_event_type"), { appName: appName, title: title })}</>
          </p>

          <hr style={{ marginBottom: "24px" }} />

          <CallToAction
            label={t("edit_event_type")}
            href={`${WEBAPP_URL}/event-types/${eventTypeId}?tabName=apps`}
          />
        </>
      ) : appType.some((type) => type === "video") ? (
        <>
          <p>
            <>{t("app_disabled_video", { appName: appName })}</>
          </p>

          <hr style={{ marginBottom: "24px" }} />

          <CallToAction label={t("navigate_installed_apps")} href={`${WEBAPP_URL}/apps/installed`} />
        </>
      ) : appType.some((type) => type === "calendar") ? (
        <>
          <p>
            <>{t("admin_has_disabled", { appName: appName })}</>
          </p>
          <p style={{ fontWeight: 400, lineHeight: "24px" }}>
            <>{t("disabled_calendar")}</>
          </p>

          <hr style={{ marginBottom: "24px" }} />

          <CallToAction label={t("navigate_installed_apps")} href={`${WEBAPP_URL}/apps/installed`} />
        </>
      ) : (
        <>
          <p>
            <>{t("admin_has_disabled", { appName: appName })}</>
          </p>

          <hr style={{ marginBottom: "24px" }} />

          <CallToAction label={t("navigate_installed_apps")} href={`${WEBAPP_URL}/apps/installed`} />
        </>
      )}
    </BaseEmailHtml>
  );
};
