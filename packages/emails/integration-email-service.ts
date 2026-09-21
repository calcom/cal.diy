import type BaseEmail from "@calcom/emails/templates/_base-email";
import { formatCalEvent } from "@calcom/lib/formatCalendarEvent";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import BrokenIntegrationEmail from "./templates/broken-integration-email";
import DisabledAppEmail from "./templates/disabled-app-email";
import SlugReplacementEmail from "./templates/slug-replacement-email";

const sendEmail = (prepare: () => BaseEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const email = prepare();
      resolve(email.sendEmail());
    } catch (e) {
      reject(console.error(`${prepare.constructor.name}.sendEmail failed`, e));
    }
  });
};

export const sendBrokenIntegrationEmail = async (evt: CalendarEvent, type: "video" | "calendar") => {
  const calendarEvent = formatCalEvent(evt);
  await sendEmail(() => new BrokenIntegrationEmail(calendarEvent, type));
};

export const sendDisabledAppEmail = async ({
  email,
  appName,
  appType,
  t,
  title = undefined,
  eventTypeId = undefined,
}: {
  email: string;
  appName: string;
  appType: string[];
  t: TFunction;
  title?: string;
  eventTypeId?: number;
}) => {
  await sendEmail(() => new DisabledAppEmail(email, appName, appType, t, title, eventTypeId));
};

export const sendSlugReplacementEmail = async ({
  email,
  name,
  teamName,
  t,
  slug,
}: {
  email: string;
  name: string;
  teamName: string | null;
  t: TFunction;
  slug: string;
}) => {
  await sendEmail(() => new SlugReplacementEmail(email, name, teamName, slug, t));
};
