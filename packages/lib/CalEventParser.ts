import type { TFunction } from "i18next";
import short from "short-uuid";

import getLabelValueMapFromResponses from "@calcom/lib/bookings/getLabelValueMapFromResponses";
import { Prisma } from "@calcom/prisma/client";
import type {
  AdditionalInformation,
  AppsStatus,
  CalEventResponses,
  Person,
  RecurringEvent,
  TeamMember,
  VideoCallData,
} from "@calcom/types/Calendar";

import { WEBAPP_URL } from "./constants";
import { isValidHttpUrl } from "./isValidHttpUrl";
import isSmsCalEmail from "./isSmsCalEmail";
import {
  buildPlatformCancelLink,
  buildPlatformRescheduleLink,
  buildStandardCancelLink,
  buildStandardRescheduleLink,
} from "./LinkBuilder";

const translator = short();

// The odd indentation in this file is necessary because otherwise the leading tabs will be applied into the event description.

export const getWhat = (title: string, t: TFunction) => {
  return `${t("what")}:\n${title}`;
};

export const getWhen = (
  calEvent: {
    organizer: Person;
    attendees?: Person[];
    seatsPerTimeSlot?: number | null;
  },
  t: TFunction
) => {
  const organizerTimezone = calEvent.organizer?.timeZone ?? "UTC";
  const defaultTimezone = organizerTimezone;
  const attendeeTimezone = calEvent.attendees?.[0]?.timeZone ?? defaultTimezone;

  return calEvent.seatsPerTimeSlot
    ? `${t("organizer_timezone")}:\n${organizerTimezone}`
    : `${t("invitee_timezone")}:\n${attendeeTimezone}`;
};

export const getWho = (
  calEvent: {
    attendees: Person[];
    seatsPerTimeSlot?: number | null;
    seatsShowAttendees?: boolean | null;
    organizer: Person;
    team?: {
      id: number;
      members?: TeamMember[];
    };
    hideOrganizerEmail?: boolean;
  },
  t: TFunction
) => {
  let attendeesFromCalEvent = [...calEvent.attendees];
  if (calEvent.seatsPerTimeSlot && !calEvent.seatsShowAttendees) {
    attendeesFromCalEvent = [];
  }
  const attendees = attendeesFromCalEvent
    .map(
      (attendee) =>
        `${attendee?.name || t("guest")}${attendee.phoneNumber ? ` - ${attendee.phoneNumber}` : ""}\n${
          !isSmsCalEmail(attendee.email) ? attendee.email : ""
        }`
    )
    .join("\n");

  const organizer = calEvent.hideOrganizerEmail
    ? `${calEvent.organizer.name} - ${t("organizer")}`
    : `${calEvent.organizer.name} - ${t("organizer")}\n${calEvent.organizer.email}`;

  const teamMembers = calEvent.team?.members
    ? calEvent.team.members
        .map((member) =>
          calEvent.hideOrganizerEmail
            ? `${member.name} - ${t("team_member")}`
            : `${member.name} - ${t("team_member")}\n${member.email}`
        )
        .join("\n")
    : [];

  return `${t("who")}:\n${organizer}${attendees ? `\n${attendees}` : ""}${
    teamMembers.length ? `\n${teamMembers}` : ""
  }`;
};

export const getAdditionalNotes = (t: TFunction, additionalNotes?: string | null) => {
  if (!additionalNotes) {
    return "";
  }
  return `${t("additional_notes")}:\n${additionalNotes}`;
};

export const getUserFieldsResponses = (
  calEvent: {
    customInputs?: Prisma.JsonObject | null;
    userFieldsResponses?: CalEventResponses | null;
    responses?: CalEventResponses | null;
    eventTypeId?: number | null;
  },
  t: TFunction
) => {
  const labelValueMap = getLabelValueMapFromResponses(calEvent);

  if (!labelValueMap) {
    return "";
  }
  const responsesString = Object.keys(labelValueMap)
    .map((key) => {
      if (!labelValueMap) return "";
      if (labelValueMap[key] != null && labelValueMap[key] !== "") {
        return `
${t(key)}:
${labelValueMap[key]}
  `;
      }
    })
    .join("");

  return responsesString;
};

export const getAppsStatus = (t: TFunction, appsStatus?: AppsStatus[] | null) => {
  if (!appsStatus) {
    return "";
  }
  return `\n${t("apps_status")}
      ${appsStatus.map((app) => {
        return `\n- ${app.appName} ${
          app.success >= 1 ? `✅ ${app.success > 1 ? `(x${app.success})` : ""}` : ""
        }${
          app.warnings && app.warnings.length >= 1 ? app.warnings.map((warning) => `\n   - ${warning}`) : ""
        } ${app.failures && app.failures >= 1 ? `❌ ${app.failures > 1 ? `(x${app.failures})` : ""}` : ""} ${
          app.errors && app.errors.length >= 1 ? app.errors.map((error) => `\n   - ${error}`) : ""
        }`;
      })}
    `;
};

/**
 * Converts HTML to plain text while preserving line breaks and links.
 * Used for calendar event descriptions that are stored as HTML from the rich text editor.
 */
const htmlToPlainText = (html: string): string => {
  return (
    html
      // Convert links to markdown-style format: [text](url)
      .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, (_, url, text) => {
        // If link text is the same as URL, just show the URL
        if (text === url || !text.trim()) {
          return url;
        }
        return `${text} (${url})`;
      })
      // Convert block-level elements to newlines
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      // Strip remaining HTML tags
      .replace(/<\/?[^>]+(>|$)/g, "")
      // Normalize multiple newlines to max 2
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
};

export const getDescription = (t: TFunction, description?: string | null) => {
  if (!description) {
    return "";
  }
  const plainText = htmlToPlainText(description);
  return `${t("description")}\n${plainText}`;
};

export const getLocation = (calEvent: {
  videoCallData?: { type?: string; url?: string };
  additionalInformation?: AdditionalInformation;
  location?: string | null;
  uid?: string | null;
}) => {
  const meetingUrl = getVideoCallUrlFromCalEvent(calEvent);
  if (meetingUrl) {
    return meetingUrl;
  }
  const providerName = getProviderName(calEvent.location);
  return providerName || calEvent.location || "";
};

export const getProviderName = (location?: string | null): string => {
  if (location && location.includes("integrations:")) {
    let locationName = location.split(":")[1];
    if (locationName === "daily") {
      locationName = "Cal Video";
    }
    return locationName[0].toUpperCase() + locationName.slice(1);
  }
  if (location && isValidHttpUrl(location)) {
    return location;
  }
  return "";
};

export const getUid = (uid?: string | null): string => {
  // If uid is provided, return it. Otherwise generate a random short UUID as fallback.
  // Note: The original implementation used JSON.stringify(calEvent) for deterministic fallback,
  // but with narrow inputs we can't do that. In practice, uid should always be set.
  return uid ?? translator.new();
};

const getSeatReferenceId = (attendeeSeatId?: string): string => {
  return attendeeSeatId ? attendeeSeatId : "";
};

export const getBookingUrl = (calEvent: {
  platformClientId?: string | null;
  platformBookingUrl?: string | null;
  bookerUrl?: string;
  type: string;
  uid?: string | null;
  organizer: Person;
  attendeeSeatId?: string;
}) => {
  const seatReferenceUid = getSeatReferenceId(calEvent.attendeeSeatId);
  if (calEvent.platformClientId) {
    if (!calEvent.platformBookingUrl) return "";
    return `${calEvent.platformBookingUrl}/${getUid(calEvent.uid)}?slug=${calEvent.type}&username=${
      calEvent.organizer.username
    }${seatReferenceUid ? `&seatReferenceUid=${seatReferenceUid}` : ""}&changes=true`;
  }

  return `${calEvent.bookerUrl ?? WEBAPP_URL}/booking/${getUid(calEvent.uid)}?changes=true`;
};

export const getPlatformManageLink = (
  calEvent: {
    platformBookingUrl?: string | null;
    platformRescheduleUrl?: string | null;
    platformCancelUrl?: string | null;
    type: string;
    organizer: Person;
    recurringEvent?: RecurringEvent | null;
    bookerUrl?: string | null;
    uid?: string | null;
    attendeeSeatId?: string;
    team?: {
      id: number;
    };
  },
  t: TFunction
) => {
  const shouldDisplayReschedule = !calEvent.recurringEvent && calEvent.platformRescheduleUrl;
  const seatUid = getSeatReferenceId(calEvent.attendeeSeatId);

  let res =
    calEvent.platformBookingUrl || shouldDisplayReschedule || calEvent.platformCancelUrl
      ? `${t("need_to_reschedule_or_cancel")} `
      : ``;
  if (calEvent.platformBookingUrl) {
    res += `Check Here: ${calEvent.platformBookingUrl}/${getUid(calEvent.uid)}?slug=${
      calEvent.type
    }&username=${calEvent.organizer.username}${calEvent?.team ? `&teamId=${calEvent.team.id}` : ""}${
      seatUid ? `&seatReferenceUid=${seatUid}` : ""
    }&changes=true${calEvent.platformCancelUrl || shouldDisplayReschedule ? ` ${t("or_lowercase")} ` : ""}`;
  }
  if (calEvent.platformCancelUrl) {
    res += `${t("cancel")}: ${getCancelLink(calEvent)}`;
  }

  if (!calEvent.recurringEvent && calEvent.platformRescheduleUrl) {
    res += `${calEvent.platformCancelUrl ? ` ${t("or_lowercase")} ` : ""}${t(
      "reschedule"
    )}: ${getRescheduleLink({ calEvent })}`;
  }

  return res;
};

export const getManageLink = (
  calEvent: {
    platformClientId?: string | null;
    platformBookingUrl?: string | null;
    platformCancelUrl?: string | null;
    platformRescheduleUrl?: string | null;
    type: string;
    organizer: Person;
    recurringEvent?: RecurringEvent | null;
    bookerUrl?: string | null;
    uid?: string | null;
    attendeeSeatId?: string;
    team?: {
      id: number;
    };
  },
  t: TFunction
) => {
  if (calEvent.platformClientId) {
    return getPlatformManageLink(calEvent, t);
  }

  return `${t("need_to_reschedule_or_cancel")} ${calEvent.bookerUrl ?? WEBAPP_URL}/booking/${getUid(
    calEvent.uid
  )}?changes=true`;
};

export const getPlatformCancelLink = (
  calEvent: {
    platformCancelUrl?: string | null;
    type: string;
    organizer: Person;
    recurringEvent?: RecurringEvent | null;
    bookerUrl?: string | null;
    uid?: string | null;
    attendeeSeatId?: string;
    team?: {
      id: number;
    };
  },
  bookingUid: string,
  seatUid?: string
): string => {
  if (calEvent.platformCancelUrl) {
    return buildPlatformCancelLink({
      platformCancelUrl: calEvent.platformCancelUrl,
      uid: bookingUid,
      slug: calEvent.type,
      username: calEvent.organizer.username ?? undefined,
      isRecurring: !!calEvent.recurringEvent,
      seatReferenceUid: seatUid,
      teamId: calEvent.team?.id,
    });
  }
  return "";
};

export const getCancelLink = (
  calEvent: {
    platformClientId?: string | null;
    platformCancelUrl?: string | null;
    type: string;
    organizer: Person;
    recurringEvent?: RecurringEvent | null;
    bookerUrl?: string | null;
    uid?: string | null;
    attendeeSeatId?: string;
    team?: {
      id: number;
    };
  },
  attendee?: Person
): string => {
  const Uid = getUid(calEvent.uid);
  const seatReferenceUid = getSeatReferenceId(calEvent.attendeeSeatId);
  if (calEvent.platformClientId) {
    return getPlatformCancelLink(calEvent, Uid, seatReferenceUid);
  }

  return buildStandardCancelLink({
    bookerUrl: calEvent.bookerUrl ?? WEBAPP_URL,
    uid: Uid,
    cancelledBy: attendee?.email,
    seatReferenceUid: seatReferenceUid || undefined,
    isRecurring: !!calEvent.recurringEvent,
  });
};

export const getPlatformRescheduleLink = (
  calEvent: {
    platformRescheduleUrl?: string | null;
    type: string;
    organizer: Person;
    team?: {
      id: number;
    };
  },
  bookingUid: string,
  seatUid?: string
): string => {
  if (calEvent.platformRescheduleUrl) {
    return buildPlatformRescheduleLink({
      platformRescheduleUrl: calEvent.platformRescheduleUrl,
      uid: bookingUid,
      slug: calEvent.type,
      username: calEvent.organizer.username ?? undefined,
      seatReferenceUid: seatUid,
      teamId: calEvent.team?.id,
    });
  }
  return "";
};

export const getRescheduleLink = ({
  calEvent,
  allowRescheduleForCancelledBooking = false,
  attendee,
}: {
  calEvent: {
    platformClientId?: string | null;
    platformRescheduleUrl?: string | null;
    type: string;
    organizer: Person;
    team?: {
      id: number;
    };
    uid?: string | null;
    attendeeSeatId?: string;
    bookerUrl?: string | null;
  };
  allowRescheduleForCancelledBooking?: boolean;
  attendee?: Person;
}): string => {
  const Uid = getUid(calEvent.uid);
  const seatUid = getSeatReferenceId(calEvent.attendeeSeatId);

  if (calEvent.platformClientId) {
    return getPlatformRescheduleLink(calEvent, Uid, seatUid);
  }

  return buildStandardRescheduleLink({
    bookerUrl: calEvent.bookerUrl ?? WEBAPP_URL,
    uid: Uid,
    rescheduledBy: attendee?.email,
    seatReferenceUid: seatUid || undefined,
    allowRescheduleForCancelledBooking,
  });
};

type RichDescriptionCalEvent = {
  organizer: Person;
  paymentInfo?: {
    link?: string | null;
  } | null;
  type: string;
  cancellationReason?: string | null;
  title: string;
  attendees: Person[];
  seatsPerTimeSlot?: number | null;
  seatsShowAttendees?: boolean | null;
  team?: {
    id: number;
    members?: TeamMember[];
  };
  additionalNotes?: string | null;
  customInputs?: Prisma.JsonObject | null;
  description?: string | null;
  userFieldsResponses?: CalEventResponses | null;
  responses?: CalEventResponses | null;
  eventTypeId?: number | null;
  appsStatus?: AppsStatus[] | null;
  manageLink?: string | null;
  hideOrganizerEmail?: boolean;
  videoCallData?: { type?: string; url?: string };
  additionalInformation?: AdditionalInformation;
  location?: string | null;
  uid?: string | null;
};

export const getRichDescriptionHTML = (
  calEvent: RichDescriptionCalEvent,
  t_?: TFunction,
  includeAppStatus = false
) => {
  const t = t_ ?? calEvent.organizer.language.translate;

  // Helper function to convert plain text with newlines to HTML paragraphs
  const textToHtml = (text: string) => {
    if (!text) return "";
    const lines = text.split("\n").filter(Boolean);
    return lines
      .map((line, index) => {
        if (index === 0) {
          return `<p><strong>${line}</strong></p>`;
        }
        return `<p>${line}</p>`;
      })
      .join("");
  };

  // Convert the manage link to a clickable hyperlink
  const manageLinkText = getManageLink(calEvent, t);
  const manageLinkHtml = manageLinkText
    ? (() => {
        const words = manageLinkText.split(" ");
        const lastWord = words.pop();
        if (lastWord && lastWord.includes("http")) {
          const textWithoutLink = words.join(" ").trim();
          return `<p><strong>${textWithoutLink}</strong> <a href="${lastWord}">Click here</a></p>`;
        }
        return `<p>${manageLinkText}</p>`;
      })()
    : "";

  // Build the HTML content for each section
  const parts = [
    textToHtml(getCancellationReason(t, calEvent.cancellationReason)),
    textToHtml(getWhat(calEvent.title, t)),
    textToHtml(
      getWhen(
        {
          organizer: calEvent.organizer,
          attendees: calEvent.attendees,
          seatsPerTimeSlot: calEvent.seatsPerTimeSlot,
        },
        t
      )
    ),
    textToHtml(
      getWho(
        {
          attendees: calEvent.attendees,
          seatsPerTimeSlot: calEvent.seatsPerTimeSlot,
          seatsShowAttendees: calEvent.seatsShowAttendees,
          organizer: calEvent.organizer,
          team: calEvent.team,
          hideOrganizerEmail: calEvent.hideOrganizerEmail,
        },
        t
      )
    ),
    textToHtml(getDescription(t, calEvent.description)),
    textToHtml(getAdditionalNotes(t, calEvent.additionalNotes)),
    textToHtml(
      getUserFieldsResponses(
        {
          customInputs: calEvent.customInputs,
          userFieldsResponses: calEvent.userFieldsResponses,
          responses: calEvent.responses,
          eventTypeId: calEvent.eventTypeId,
        },
        t
      )
    ),
    includeAppStatus ? textToHtml(getAppsStatus(t, calEvent.appsStatus)) : "",
    manageLinkHtml,
    calEvent.paymentInfo
      ? `<p><strong>${t("pay_now")}:</strong> <a href="${calEvent.paymentInfo.link}">${
          calEvent.paymentInfo.link
        }</a></p>`
      : "",
  ]
    .filter(Boolean) // Remove empty strings
    .join("\n"); // Single newline between sections

  return parts.trim();
};

export const getRichDescription = (
  calEvent: RichDescriptionCalEvent,
  t_?: TFunction /*, attendee?: Person*/,
  includeAppStatus = false
) => {
  const t = t_ ?? calEvent.organizer.language.translate;

  // Join all parts with single newlines and remove extra whitespace
  const parts = [
    getCancellationReason(t, calEvent.cancellationReason),
    getWhat(calEvent.title, t),
    getWhen(
      {
        organizer: calEvent.organizer,
        attendees: calEvent.attendees,
        seatsPerTimeSlot: calEvent.seatsPerTimeSlot,
      },
      t
    ),
    getWho(
      {
        attendees: calEvent.attendees,
        seatsPerTimeSlot: calEvent.seatsPerTimeSlot,
        seatsShowAttendees: calEvent.seatsShowAttendees,
        organizer: calEvent.organizer,
        team: calEvent.team,
        hideOrganizerEmail: calEvent.hideOrganizerEmail,
      },
      t
    ),
    `${t("where")}:\n${getLocation({
      videoCallData: calEvent.videoCallData,
      additionalInformation: calEvent.additionalInformation,
      location: calEvent.location,
      uid: calEvent.uid,
    })}`,
    getDescription(t, calEvent.description),
    getAdditionalNotes(t, calEvent.additionalNotes),
    getUserFieldsResponses(calEvent, t),
    includeAppStatus ? getAppsStatus(t, calEvent.appsStatus) : "",
    // TODO: Only the original attendee can make changes to the event
    // Guests cannot
    calEvent.seatsPerTimeSlot ? "" : getManageLink(calEvent, t),
    calEvent.paymentInfo ? `${t("pay_now")}:\n${calEvent.paymentInfo.link}` : "",
  ]
    .filter(Boolean) // Remove empty strings
    .join("\n\n") // Double newline between major sections
    .replace(/\n{3,}/g, "\n\n") // Ensure no more than double newlines
    .trim();

  return parts;
};

export const getCancellationReason = (t: TFunction, cancellationReason?: string | null) => {
  if (!cancellationReason) return "";
  const sanitized = cancellationReason.startsWith("$RCH$")
    ? cancellationReason.substring(5).trim()
    : cancellationReason.trim();
  return `${t("cancellation_reason")}:\n${sanitized}`;
};

export const isDailyVideoCall = (videoCallData?: VideoCallData): boolean => {
  return videoCallData?.type === "daily_video";
};

export const getPublicVideoCallUrl = (uid?: string | null): string => {
  return `${WEBAPP_URL}/video/${getUid(uid)}`;
};

export const getVideoCallUrlFromCalEvent = (calEvent: {
  videoCallData?: { type?: string; url?: string };
  additionalInformation?: AdditionalInformation;
  location?: string | null;
  uid?: string | null;
}): string => {
  if (calEvent.videoCallData) {
    if (calEvent.videoCallData.type === "daily_video") {
      return getPublicVideoCallUrl(calEvent.uid);
    }
    return calEvent.videoCallData.url ?? "";
  }
  if (calEvent.additionalInformation?.hangoutLink) {
    return calEvent.additionalInformation.hangoutLink;
  }
  if (calEvent.location?.startsWith("http")) {
    return calEvent.location;
  }
  return "";
};

export const getVideoCallPassword = (videoCallData?: VideoCallData): string => {
  return isDailyVideoCall(videoCallData) ? "" : (videoCallData?.password ?? "");
};
