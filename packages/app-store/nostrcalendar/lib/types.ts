import type { Event as NostrEvent } from "nostr-tools";
// Note: Using lib/types path for TypeScript, runtime resolves to lib/esm via package.json exports
import type { BunkerSigner } from "nostr-tools/lib/types/nip46";

// Authentication types
export type AuthType = "nsec" | "bunker";

// Bunker connection information
export interface BunkerConnection {
  bunker: BunkerSigner;
  clientSecret: Uint8Array;
}

// NIP-52 Calendar Event Types
export type CalendarEventKind = 31922 | 31923 | 31925 | 31927;

// Date-based calendar event (kind 31922)
export interface DateBasedCalendarEvent extends NostrEvent {
  kind: 31922;
}

// Time-based calendar event (kind 31923)
export interface TimeBasedCalendarEvent extends NostrEvent {
  kind: 31923;
}

// Calendar RSVP (kind 31925)
export interface CalendarRSVP extends NostrEvent {
  kind: 31925;
}

// Calendar availability block (kind 31927)
export interface CalendarAvailabilityBlock extends NostrEvent {
  kind: 31927;
}

// Parsed calendar event with timing info
export interface ParsedCalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title?: string;
  start: Date;
  end: Date;
  timezone?: string;
  status?: "accepted" | "declined" | "tentative";
  parentEventRef?: string; // For RSVPs
}
