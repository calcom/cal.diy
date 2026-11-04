import Script from "next/script";

import { getEventTypeAppData } from "@calcom/app-store/_utils/getEventTypeAppData";
import { appStoreMetadata } from "@calcom/app-store/bookerAppsMetaData";
import type { Tag } from "@calcom/app-store/types";
import { sdkActionManager } from "@calcom/lib/sdk-event";
import type { AppMeta } from "@calcom/types/App";

import type { appDataSchemas } from "./apps.schemas.generated";

const PushEventPrefix = "cal_analytics_app_";

const JS_STRING_LITERAL_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "'": "\\'",
  '"': '\\"',
  "`": "\\`",
  "$": "\\$",
  "<": "\\x3C",
  ">": "\\x3E",
  "\r": "\\r",
  "\n": "\\n",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Escapes a value that is substituted into a JS string literal inside an inline <script>.
 * Quotes and backslashes keep the value inside its literal, `$` keeps it from starting an
 * interpolation when the literal is delimited by backticks, and `<`/`>` keep it from ending
 * the script element. A backslash before `$` is a no-op in every literal form, so values that
 * analytics apps legitimately hold (ids, hostnames, URLs, amounts) render unchanged.
 */
const escapeJsStringLiteral = (value: string) =>
  value.replace(/[\\'"`<>$\r\n\u2028\u2029]/g, (char) => JS_STRING_LITERAL_ESCAPES[char]);

// AnalyticApp has appData.tag always set
type AnalyticApp = Omit<AppMeta, "appData"> & {
  appData: Omit<NonNullable<AppMeta["appData"]>, "tag"> & {
    tag: NonNullable<NonNullable<AppMeta["appData"]>["tag"]>;
  };
};

const getPushEventScript = ({ tag, appId }: { tag: Tag; appId: string }) => {
  if (!tag.pushEventScript) {
    return tag.pushEventScript;
  }

  return {
    ...tag.pushEventScript,
    // In case of complex pushEvent implementations, we could think about exporting a pushEvent function from the analytics app maybe but for now this should suffice
    content: tag.pushEventScript?.content?.replace("$pushEvent", `${PushEventPrefix}_${appId}`),
  };
};

function getAnalyticsApps(eventType: Parameters<typeof getEventTypeAppData>[0]) {
  return Object.entries(appStoreMetadata).reduce(
    (acc, entry) => {
      const [appId, app] = entry;
      const eventTypeAppData = getEventTypeAppData(eventType, appId as keyof typeof appDataSchemas);

      if (!eventTypeAppData || !app.appData?.tag) {
        return acc;
      }

      acc[appId] = {
        meta: app as AnalyticApp,
        eventTypeAppData: eventTypeAppData,
      };
      return acc;
    },
    {} as Record<
      string,
      {
        meta: AnalyticApp;
        eventTypeAppData: ReturnType<typeof getEventTypeAppData>;
      }
    >
  );
}

export function handleEvent(event: { detail: Record<string, unknown> & { type: string } }) {
  const { type: name, ...data } = event.detail;
  // Don't push internal events to analytics apps
  // They are meant for internal use like helping embed make some decisions
  if (name.startsWith("__")) {
    return false;
  }

  Object.entries(window).forEach(([prop, value]) => {
    if (!prop.startsWith(PushEventPrefix) || typeof value !== "function") {
      return;
    }
    // Find the pushEvent if defined by the analytics app
    const pushEvent = window[prop as keyof typeof window];

    pushEvent({
      name,
      data,
    });
  });

  // Support sending all events to opener which is currently used by ReroutingDialog to identify if the booking is successfully rescheduled.
  if (window.opener) {
    window.opener.postMessage(
      {
        type: `CAL:${name}`,
        ...data,
      },
      "*"
    );
  }
  return true;
}

export default function BookingPageTagManager({
  eventType,
}: {
  eventType: Parameters<typeof getEventTypeAppData>[0];
}) {
  const analyticsApps = getAnalyticsApps(eventType);
  return (
    <>
      {Object.entries(analyticsApps).map(([appId, { meta: app, eventTypeAppData }]) => {
        const tag = app.appData.tag;
        const parseValue = <T extends string | undefined>(
          val: T,
          escapeSubstitution: (value: string) => string = (value) => value
        ): T => {
          if (!val) {
            return val;
          }

          // Only support UpperCase,_and numbers in template variables. This prevents accidental replacement of other strings.
          const regex = /\{([A-Z_\d]+)\}/g;
          let matches;
          const appDataRecord = eventTypeAppData as Record<string, unknown>;
          while ((matches = regex.exec(val))) {
            const variableName = matches[1];
            if (appDataRecord[variableName]) {
              const substitution = escapeSubstitution(String(appDataRecord[variableName]));
              // Replace if value is available. It can possible not be a template variable that just matches the regex.
              // The replacement is a function so that `$&` and friends in the value stay literal.
              val = val.replace(new RegExp(`{${variableName}}`, "g"), () => substitution) as NonNullable<T>;
            }
          }
          return val;
        };

        const pushEventScript = getPushEventScript({ tag, appId });
        return tag.scripts.concat(pushEventScript ? [pushEventScript] : []).map((script, index) => {
          const parsedAttributes: NonNullable<(typeof tag.scripts)[number]["attrs"]> = {};
          const attrs = script.attrs || {};
          Object.entries(attrs).forEach(([name, value]) => {
            if (typeof value === "string") {
              value = parseValue(value);
            }
            parsedAttributes[name] = value;
          });

          return (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Analytics script injection
            <Script
              data-testid={`cal-analytics-app-${appId}`}
              src={parseValue(script.src)}
              id={`${appId}-${index}`}
              key={`${appId}-${index}`}
              // It is strictly not necessary to disable, but in a future update of react/no-danger this will error.
              // And we don't want it to error here anyways
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                // The content is inline script source, so substituted values are escaped for the
                // JS string literals they land in. `src` and `attrs` are React props and stay
                // unescaped because React escapes attribute values itself.
                __html: parseValue(script.content, escapeJsStringLiteral) || "",
              }}
              {...parsedAttributes}
              defer
            />
          );
        });
      })}
    </>
  );
}

if (typeof window !== "undefined") {
  // Attach listener outside React as it has to be attached only once per page load
  // Setup listener for all events to push to analytics apps
  sdkActionManager?.on("*", handleEvent);
}
