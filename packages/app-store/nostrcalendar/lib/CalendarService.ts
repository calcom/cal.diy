import { getLocation } from "@calcom/lib/CalEventParser";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import type {
  Calendar,
  CalendarEvent,
  CalendarServiceEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";

import type { NostrCredential } from "../zod";
import { BunkerManager } from "./BunkerManager";
import { NostrClient } from "./NostrClient";

const log = logger.getSubLogger({ prefix: ["nostr-calendar-service"] });

export default class NostrCalendarService implements Calendar {
  private integrationName = "nostr_calendar";
  private credential: CredentialForCalendarServiceWithEmail;
  private nostrClient: NostrClient | null = null;

  constructor(credential: CredentialForCalendarServiceWithEmail) {
    this.credential = credential;
  }

  /**
   * Initialize Nostr client (lazy initialization)
   * Supports both nsec and bunker authentication
   */
  private async getNostrClient(): Promise<NostrClient> {
    if (this.nostrClient) {
      return this.nostrClient;
    }

    const credentialKey = this.credential.key as NostrCredential;

    // Get encryption key for decrypting stored secrets
    const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("CALENDSO_ENCRYPTION_KEY is not configured");
    }

    // The encryption key is stored as base64, but symmetricDecrypt expects latin1
    const decodedKey = Buffer.from(encryptionKey, "base64").toString("latin1");

    if (credentialKey.authType === "bunker") {
      // Bunker authentication
      log.info("Initializing NostrClient with bunker auth");

      try {
        const bunker = await BunkerManager.reconnect(
          credentialKey.bunkerUri,
          credentialKey.localClientSecret,
          decodedKey
        );

        this.nostrClient = new NostrClient({ bunker });
        log.info("NostrClient initialized with bunker successfully");
      } catch (error) {
        log.error("Failed to reconnect to bunker", error);
        throw new Error(
          "Failed to connect to bunker. Please reconnect the Nostr Calendar app in your settings."
        );
      }
    } else {
      // nsec authentication
      log.info("Initializing NostrClient with nsec auth");

      const nsec = symmetricDecrypt(credentialKey.nsec, decodedKey);
      this.nostrClient = new NostrClient({ nsec });
      log.info("NostrClient initialized with nsec successfully");
    }

    return this.nostrClient;
  }

  /**
   * Get credential ID
   */
  public getCredentialId(): number {
    return this.credential.id;
  }

  /**
   * Create a new calendar event in Nostr
   */
  async createEvent(calEvent: CalendarServiceEvent, _credentialId: number): Promise<NewCalendarEventType> {
    log.info("Creating Nostr calendar event", {
      title: calEvent.title,
      startTime: new Date(calEvent.startTime).toISOString(),
      endTime: new Date(calEvent.endTime).toISOString(),
    });

    try {
      const client = await this.getNostrClient();

      // Use Cal.com's standard location parser which handles video URLs correctly
      const location = getLocation(calEvent) || undefined;

      // Create the main calendar event (kind 31923)
      const eventId = await client.createCalendarEvent({
        title: calEvent.title,
        description: calEvent.additionalNotes || "",
        startTime: new Date(calEvent.startTime),
        endTime: new Date(calEvent.endTime),
        timezone: calEvent.organizer.timeZone,
        location: location,
        // Optionally include attendee npubs if available
      });

      // Also create an availability block (kind 31927) to mark as busy
      const blockId = await client.createAvailabilityBlock({
        startTime: new Date(calEvent.startTime),
        endTime: new Date(calEvent.endTime),
      });

      log.info("Nostr events published successfully", { eventId, blockId });

      return {
        uid: "",
        id: eventId,
        type: this.integrationName,
        password: "",
        url: "",
        additionalInfo: {
          blockId: blockId,
        },
      };
    } catch (error) {
      log.error("Error creating Nostr calendar event", error);
      throw error;
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    uid: string,
    event: CalendarServiceEvent,
    _externalCalendarId: string
  ): Promise<NewCalendarEventType> {
    log.debug("Updating Nostr calendar event", { uid });

    // Nostr doesn't support updates - we need to delete and recreate
    try {
      const client = await this.getNostrClient();

      // Delete old event
      await client.deleteEvent(uid, "Event updated");

      // Create new event
      return await this.createEvent(event, this.credential.id);
    } catch (error) {
      log.error("Error updating Nostr calendar event", error);
      throw error;
    }
  }

  /**
   * Delete a calendar event and its availability block
   */
  async deleteEvent(uid: string, event: CalendarEvent, _externalCalendarId?: string | null): Promise<void> {
    log.info("Deleting Nostr calendar event", {
      uid,
      startTime: event.startTime,
      endTime: event.endTime,
    });

    try {
      const client = await this.getNostrClient();

      // Delete the main calendar event (kind 31923)
      await client.deleteEvent(uid, "Event cancelled");

      // Delete the associated availability block(s) (kind 31927) by time
      await client.deleteAvailabilityBlocksByTime(new Date(event.startTime), new Date(event.endTime));

      log.info("Nostr calendar event and availability block deleted successfully");
    } catch (error) {
      log.error("Error deleting Nostr calendar event", error);
      throw error;
    }
  }

  /**
   * Get availability (busy times) from Nostr events
   */
  async getAvailability(
    dateFrom: string,
    dateTo: string,
    _selectedCalendars: IntegrationCalendar[]
  ): Promise<EventBusyDate[]> {
    log.info("Getting availability from Nostr", {
      dateFrom,
      dateTo,
    });

    try {
      const client = await this.getNostrClient();

      const since = Math.floor(new Date(dateFrom).getTime() / 1000);
      const until = Math.floor(new Date(dateTo).getTime() / 1000);

      // Query only public calendar events and availability blocks (31927)
      // We don't need to check private events because we create 31927 blocks for those
      const events = await client.queryPublicCalendarEvents(since, until);

      const parsedEvents = client.parseCalendarEvents(events);
      log.info(`Parsed ${parsedEvents.length} events`, {
        kinds: parsedEvents.map((e) => e.kind),
      });

      // Handle RSVPs - need to fetch parent events for timing
      // Only look up public parent events since we're checking availability
      const rsvps = parsedEvents.filter((e) => e.kind === 31925 && e.parentEventRef);
      for (const rsvp of rsvps) {
        if (rsvp.parentEventRef) {
          // Parse the 'a' tag: "kind:pubkey:d-tag"
          const [kindStr] = rsvp.parentEventRef.split(":");

          // Query for the public parent event by kind, author, and d-tag
          const parentEvents = await client.queryPublicCalendarEvents(undefined, undefined, [
            parseInt(kindStr) as 31922 | 31923,
          ]);

          const parentEvent = parentEvents.find((e) => {
            const tags = new Map(e.tags.map((tag) => [tag[0], tag.slice(1)]));
            const dTag = tags.get("d")?.[0];
            return rsvp.parentEventRef?.endsWith(`:${dTag}`);
          });

          if (parentEvent) {
            const parsed = client.parseCalendarEvents([parentEvent])[0];
            if (parsed) {
              rsvp.start = parsed.start;
              rsvp.end = parsed.end;
              rsvp.timezone = parsed.timezone;
            }
          }
        }
      }

      // Convert to EventBusyDate format
      const busyDates: EventBusyDate[] = parsedEvents
        .filter((e) => {
          // Include all events except declined RSVPs
          if (e.kind === 31925 && e.status === "declined") {
            log.debug(`Excluding declined RSVP`, { id: e.id });
            return false;
          }
          return true;
        })
        .map((e) => {
          const busySlot = {
            start: e.start.toISOString(),
            end: e.end.toISOString(),
          };
          log.debug(`Adding busy slot`, {
            kind: e.kind,
            title: e.title,
            start: busySlot.start,
            end: busySlot.end,
          });
          return busySlot;
        });

      log.info(`Returning ${busyDates.length} total busy time slots`);
      return busyDates;
    } catch (error) {
      log.error("Error getting availability from Nostr", error);
      throw error;
    }
  }

  /**
   * List available calendars (Nostr only has one "calendar" per user)
   */
  async listCalendars(): Promise<IntegrationCalendar[]> {
    const credentialKey = this.credential.key as NostrCredential;

    return [
      {
        externalId: credentialKey.npub,
        integration: this.integrationName,
        name: credentialKey.displayName || "Nostr Calendar",
        primary: true,
        readOnly: false,
        email: credentialKey.displayName || credentialKey.npub,
      },
    ];
  }
}
