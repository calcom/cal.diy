import type { RecurringRule } from "@calcom/scheduling/recurring";
import { z } from "zod";
import type { BookerLayouts } from "~/lib/booker-layouts";
import type { BookingField, BookingResponseValue } from "~/lib/booking-fields";

const MAX_RESPONSES_BYTES = 64 * 1024;

export const slotsQuerySchema = z.object({
  username: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
  from: z.string().datetime(),
  to: z.string().datetime(),
  timeZone: z.string().min(1).max(100),
  rescheduleUid: z.string().max(100).optional(),
  /** One of the event's lengths when the booker may choose; defaults to the event's length. */
  duration: z.number().int().min(1).max(1440).optional(),
});

export const createBookingSchema = z.object({
  username: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
  start: z.string().datetime(),
  timeZone: z.string().min(1).max(100),
  locale: z.string().max(20).default("en"),
  /** Answers keyed by booking field name, in Cal's format; checked against the event's questions. */
  responses: z
    .record(z.string(), z.unknown())
    .refine((value) => JSON.stringify(value).length <= MAX_RESPONSES_BYTES, {
      message: "something_went_wrong",
    }),
  rescheduleUid: z.string().max(100).optional(),
  /** Who moved the booking (Cal's rescheduledBy); the booker unless the host did it or someone is named. */
  rescheduledBy: z.string().trim().email().max(320).optional(),
  /**
   * The booker's phone for their attendee record, apart from the form: API v2 takes it on the
   * attendee, and the phone question is hidden by default.
   */
  attendeePhoneNumber: z.string().trim().max(30).optional(),
  duration: z.number().int().min(1).max(1440).optional(),
  /** The private link the booker came through, which counts one use. */
  hashedLink: z.string().max(64).optional(),
  /** How many occurrences of a recurring event to book; up to the event's count, which is the default. */
  recurringCount: z.number().int().min(1).max(100).optional(),
  /** The code emailed to the booker, for event types that require booker email verification. */
  verificationCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export type PublicEventLocation = { type: string; address?: string };

/** An answer shown back on the booking page, labelled the way the booker saw the question. */
export type BookingAnswerDto = {
  name: string;
  type: BookingField["type"];
  label: string | null;
  defaultLabel: string | null;
  value: BookingResponseValue;
};

/** How the host's public pages look; see ThemeScope. */
export type AppearanceDto = {
  theme: "light" | "dark" | null;
  brandColor: string | null;
  darkBrandColor: string | null;
  hideBranding: boolean;
};

export type PublicHostDto = {
  name: string | null;
  username: string;
  avatarUrl: string | null;
  /** 0 = Sunday; the booker's calendar starts its weeks here, as the host chose. */
  weekStartDay: number;
  allowSEOIndexing: boolean;
  appearance: AppearanceDto;
};

export type PublicEventDto = {
  host: PublicHostDto;
  eventType: {
    /** Null for group links, which book no event type. */
    id: number | null;
    title: string;
    slug: string;
    description: string | null;
    length: number;
    /** Lengths the booker can choose from; just `length` when there is no choice. */
    durations: number[];
    requiresConfirmation: boolean;
    /** Paid events: what the booker pays, in the currency's smallest unit. */
    price: { amount: number; currency: string } | null;
    locations: PublicEventLocation[];
    bookingFields: BookingField[];
    /** For recurring events, the rule; bookers may book fewer than `count` occurrences. */
    recurringEvent: RecurringRule | null;
    /** Bookers confirm their email with an emailed code before booking. */
    requiresBookerEmailVerification: boolean;
    /** Bookers see times in this zone and can't change it. */
    lockedTimeZone: string | null;
    /** Views the booker can switch between, and the one shown first. */
    bookerLayouts: BookerLayouts;
    /** The page's language, if the host chose one over the visitor's. */
    interfaceLanguage: string | null;
  };
};

export type BookingDetailsDto = {
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  location: string | null;
  cancellationReason: string | null;
  rescheduled: boolean;
  notes: string | null;
  /** The viewer's seat on a seated booking. */
  seatReferenceUid: string | null;
  /** Whether the booker may still cancel or move it, per the event type's settings. */
  canCancel: boolean;
  canReschedule: boolean;
  /** For a recurring booking: its rule and every occurrence, so the page can list them. */
  recurring: {
    freq: number;
    interval: number;
    count: number;
    occurrences: { uid: string; startTime: string; endTime: string; status: string }[];
  } | null;
  answers: BookingAnswerDto[];
  /** `email` is null when the event type hides it from attendees. */
  host: {
    name: string | null;
    email: string | null;
    username: string | null;
    appearance: AppearanceDto;
  } | null;
  eventType: { title: string; slug: string; length: number } | null;
  attendees: { name: string; email: string; timeZone: string }[];
  bookerUsername: string | null;
};

/**
 * What the booker shows for a day the host is away. For "away" days `reason` is a translation key;
 * for "holiday" days it is the holiday's name.
 */
export type OutOfOfficeDayDto = {
  kind: "away" | "holiday";
  displayName: string | null;
  reason: string | null;
  emoji: string | null;
  notes: string | null;
  toUser: { username: string; displayName: string | null } | null;
};

export type SlotsDto = {
  slots: string[];
  /** For seated events that show availability: seats per time and how many each slot has taken. */
  seats: {
    total: number;
    taken: Record<string, number>;
    /** The booking a slot's seats belong to, for slots that already have one. */
    bookingUids: Record<string, string>;
  } | null;
  /** Keyed by YYYY-MM-DD (UTC), like Cal. */
  outOfOffice: Record<string, OutOfOfficeDayDto>;
};
