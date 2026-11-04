import type { Event as NostrEvent, Filter, UnsignedEvent } from "nostr-tools";
import { nip19, nip59, SimplePool, finalizeEvent, getPublicKey } from "nostr-tools";
// Note: Using lib/types path for TypeScript, runtime resolves to lib/esm via package.json exports
import type { BunkerSigner } from "nostr-tools/lib/types/nip46";

import logger from "@calcom/lib/logger";

import type { CalendarEventKind, ParsedCalendarEvent, AuthType } from "./types";

const log = logger.getSubLogger({ prefix: ["nostr-client"] });

// Default relays used to bootstrap and discover user's kind 10002 relay list
const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export class NostrClient {
  private pool: SimplePool;
  private defaultRelays: string[] = DEFAULT_RELAYS;
  private relayListMetadata: string[] | null = null; // Cached kind 10002 relays
  private authType: AuthType;
  private secretKey?: Uint8Array; // Only for nsec auth
  private bunker?: BunkerSigner; // Only for bunker auth
  private publicKey?: string; // Cached public key
  private publicKeyPromise?: Promise<string>; // For async pubkey fetch with bunker

  constructor(auth: { nsec: string } | { bunker: BunkerSigner }) {
    this.pool = new SimplePool();

    if ("nsec" in auth) {
      // nsec-based authentication
      this.authType = "nsec";

      // Decode nsec to get secret key
      const decoded = nip19.decode(auth.nsec);
      if (decoded.type !== "nsec") {
        throw new Error("Invalid nsec key");
      }

      this.secretKey = decoded.data as Uint8Array;
      this.publicKey = getPublicKey(this.secretKey);
    } else {
      // Bunker-based authentication
      this.authType = "bunker";
      this.bunker = auth.bunker;
      // Public key will be fetched lazily when needed
    }
  }

  /**
   * Get the public key (handles both nsec and bunker auth)
   */
  private async getPublicKey(): Promise<string> {
    if (this.publicKey) {
      return this.publicKey;
    }

    if (this.authType === "bunker" && this.bunker) {
      // Fetch from bunker (cache the promise to avoid duplicate requests)
      if (!this.publicKeyPromise) {
        this.publicKeyPromise = this.bunker.getPublicKey();
      }
      this.publicKey = await this.publicKeyPromise;

      // Type guard - this should never happen but satisfies TypeScript
      if (!this.publicKey) {
        throw new Error("Failed to retrieve public key from bunker");
      }

      return this.publicKey;
    }

    throw new Error("Public key not available");
  }

  /**
   * Create gift wraps manually using bunker for signing and encryption
   * This is necessary because nip59.wrapManyEvents requires a private key
   */
  private async createGiftWrapWithBunker(
    eventTemplate: Partial<UnsignedEvent>,
    recipients: string[]
  ): Promise<NostrEvent[]> {
    if (!this.bunker) {
      throw new Error("Bunker not initialized");
    }

    const myPubkey = await this.getPublicKey();
    const wraps: NostrEvent[] = [];

    log.info("Creating gift wraps with bunker", {
      recipients: recipients.length,
      myPubkey: myPubkey.slice(0, 8),
    });

    // Create the rumor (unsigned event with proper structure)
    // Note: We manually construct this rather than using nip59.createRumor
    // because that function expects a private key parameter
    const rumorBase: UnsignedEvent = {
      ...eventTemplate,
      pubkey: myPubkey,
      created_at: eventTemplate.created_at || Math.floor(Date.now() / 1000),
      kind: eventTemplate.kind!,
      tags: eventTemplate.tags || [],
      content: eventTemplate.content || "",
    };

    // Calculate rumor ID (same as regular event ID)
    const serialized = JSON.stringify([
      0,
      rumorBase.pubkey,
      rumorBase.created_at,
      rumorBase.kind,
      rumorBase.tags,
      rumorBase.content,
    ]);
    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const rumorId = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Create rumor with id (typed as NostrEvent since it now has an id)
    const rumor = { ...rumorBase, id: rumorId } as NostrEvent;

    log.debug("Created rumor", { rumorId: rumorId.slice(0, 8) });

    // Create a gift wrap for each recipient
    for (const recipientPubkey of recipients) {
      try {
        // Step 1: Encrypt rumor using bunker's nip44Encrypt
        const encryptedRumor = await this.bunker.nip44Encrypt(recipientPubkey, JSON.stringify(rumor));

        log.debug("Encrypted rumor for recipient", {
          recipient: recipientPubkey.slice(0, 8),
          encryptedLength: encryptedRumor.length,
        });

        // Step 2: Create seal template (kind 13)
        // Randomize timestamp within 2 days in the past for privacy
        const randomOffset = Math.floor(Math.random() * 172800); // 2 days in seconds
        const sealTemplate: UnsignedEvent = {
          kind: 13,
          pubkey: myPubkey, // Seal is signed by the sender
          content: encryptedRumor,
          tags: [],
          created_at: Math.floor(Date.now() / 1000) - randomOffset,
        };

        // Step 3: Sign seal using bunker
        const signedSeal = await this.bunker.signEvent(sealTemplate);

        log.debug("Signed seal", {
          sealId: signedSeal.id.slice(0, 8),
          recipient: recipientPubkey.slice(0, 8),
        });

        // Step 4: Wrap the seal with a random key (client-side)
        // This uses nip59.createWrap which generates an ephemeral key
        const wrap = nip59.createWrap(signedSeal, recipientPubkey);

        wraps.push(wrap);

        log.debug("Created gift wrap", {
          wrapId: wrap.id.slice(0, 8),
          recipient: recipientPubkey.slice(0, 8),
        });
      } catch (error) {
        log.error("Failed to create gift wrap for recipient", {
          recipient: recipientPubkey.slice(0, 8),
          error,
        });
        throw error;
      }
    }

    log.info(`Successfully created ${wraps.length} gift wraps with bunker`);
    return wraps;
  }

  /**
   * Query kind 10002 (relay list metadata) for any user
   * This is used for general calendar operations (read/write events)
   */
  async queryRelayListMetadata(pubkey?: string): Promise<string[]> {
    const targetPubkey = pubkey || (await this.getPublicKey());

    try {
      log.info(`Querying kind 10002 relay list metadata for ${targetPubkey.slice(0, 8)}`);

      const event = await this.pool.get(this.defaultRelays, {
        kinds: [10002],
        authors: [targetPubkey],
      });

      if (!event) {
        log.info(`No kind 10002 relay list found for ${targetPubkey.slice(0, 8)}`);
        return [];
      }

      // Parse relay tags - format: ["r", "relay-url", "read|write"]
      // If marker is omitted, relay is used for both read and write
      const relayTags = event.tags.filter((tag) => tag[0] === "r");
      const relays = relayTags
        .map((tag) => tag[1])
        .filter((url): url is string => !!url && url.startsWith("wss://"));

      log.info(`Found kind 10002 with ${relays.length} relays for ${targetPubkey.slice(0, 8)}`, {
        relays,
        eventId: event.id.slice(0, 8),
      });

      return relays;
    } catch (error) {
      log.error("Error querying relay list metadata", error);
      return [];
    }
  }

  /**
   * Get relays for general calendar operations
   * Lazily fetches and caches kind 10002 relay list on first call
   * Falls back to default relays if kind 10002 not found
   */
  async getRelays(): Promise<string[]> {
    if (this.relayListMetadata === null) {
      const relays = await this.queryRelayListMetadata();
      this.relayListMetadata = relays.length > 0 ? relays : this.defaultRelays;
    }
    return this.relayListMetadata;
  }

  /**
   * Query kind 0 (user metadata/profile) to get display name
   */
  async queryUserMetadata(pubkey?: string): Promise<string | null> {
    const targetPubkey = pubkey || (await this.getPublicKey());

    try {
      log.info(`Querying kind 0 metadata for ${targetPubkey.slice(0, 8)}`);

      const event = await this.pool.get(this.defaultRelays, {
        kinds: [0],
        authors: [targetPubkey],
      });

      if (!event) {
        log.info(`No kind 0 metadata found for ${targetPubkey.slice(0, 8)}`);
        return null;
      }

      // Parse the content JSON which contains name, display_name, etc.
      const metadata = JSON.parse(event.content);
      const displayName = metadata.display_name || metadata.name || null;

      log.info(`Found display name for ${targetPubkey.slice(0, 8)}:`, { displayName });
      return displayName;
    } catch (error) {
      log.error("Error querying user metadata", error);
      return null;
    }
  }

  /**
   * Query kind 5 deletion events to get list of deleted event IDs
   */
  async queryDeletionEvents(): Promise<Set<string>> {
    try {
      const relays = await this.getRelays();

      log.info("Querying kind 5 deletion events");

      // Query public deletion events
      const publicDeletions = await this.pool.querySync(relays, {
        kinds: [5],
        authors: [await this.getPublicKey()],
      });

      log.info(`Found ${publicDeletions.length} public deletion events`);

      // Query private deletion events (gift-wrapped kind 5)
      const privateDeletionEvents = await this.queryPrivateEvents([5]);

      log.info(`Found ${privateDeletionEvents.length} private deletion events`);

      // Combine all deletions
      const allDeletions = [...publicDeletions, ...privateDeletionEvents];

      // Extract deleted event IDs from 'e' tags
      const deletedIds = new Set<string>();
      for (const deletion of allDeletions) {
        const eTags = deletion.tags.filter((tag) => tag[0] === "e");
        for (const tag of eTags) {
          const eventId = tag[1];
          if (eventId) {
            deletedIds.add(eventId);
            log.debug(`Event ${eventId.slice(0, 8)} marked as deleted`);
          }
        }
      }

      log.info(`Total ${deletedIds.size} events marked as deleted`);
      return deletedIds;
    } catch (error) {
      log.error("Error querying deletion events", error);
      return new Set();
    }
  }

  /**
   * Query ONLY public calendar events (for availability checking)
   * Does NOT unwrap private events - use this for availability/busy time checks
   * Private events have corresponding 31927 availability blocks instead
   */
  async queryPublicCalendarEvents(
    since?: number,
    until?: number,
    kinds: CalendarEventKind[] = [31922, 31923, 31925, 31927]
  ): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: kinds,
      authors: [await this.getPublicKey()],
    };

    try {
      const relays = await this.getRelays();

      log.info("Querying public calendar events only (for availability)", {
        kinds,
        relays,
        sinceDate: since ? new Date(since * 1000).toISOString() : undefined,
        untilDate: until ? new Date(until * 1000).toISOString() : undefined,
      });

      // Query deletion events first to filter out deleted events
      const deletedIds = await this.queryDeletionEvents();

      // Query public events only (no private event unwrapping)
      const publicEvents = await this.pool.querySync(relays, filter);
      log.info(`Found ${publicEvents.length} public calendar events`);

      // Filter out deleted events
      const events = publicEvents.filter((event) => {
        if (deletedIds.has(event.id)) {
          log.debug(`Excluding deleted event ${event.id.slice(0, 8)}`);
          return false;
        }
        return true;
      });

      log.info(`${events.length} public events after filtering out ${deletedIds.size} deletions`);

      // Filter by actual event start times if date range specified
      if (since !== undefined || until !== undefined) {
        const filtered = events.filter((event) => {
          const tags = new Map(event.tags.map((tag) => [tag[0], tag.slice(1)]));
          const startTag = tags.get("start")?.[0];

          if (!startTag) {
            log.debug(`Event ${event.id.slice(0, 8)} has no start tag, excluding`);
            return false;
          }

          // Parse start timestamp (could be unix timestamp or ISO date)
          const eventStart = startTag.includes("-")
            ? Math.floor(new Date(startTag).getTime() / 1000)
            : parseInt(startTag);

          const included = !(
            (since !== undefined && eventStart < since) ||
            (until !== undefined && eventStart > until)
          );

          return included;
        });
        log.info(`Filtered to ${filtered.length} public events in date range`);
        return filtered;
      }

      return events;
    } catch (error) {
      log.error("Error querying public calendar events", error);
      throw error;
    }
  }

  /**
   * Query calendar events from relays (including private events)
   * Note: Fetches ALL events by author, then filters by actual event start/end times
   * Also fetches private events (kind 1059 gift wraps) and unwraps them
   * Filters out deleted events based on kind 5 deletion events
   * Use queryPublicCalendarEvents() for availability checking instead
   */
  async queryCalendarEvents(
    since?: number,
    until?: number,
    kinds: CalendarEventKind[] = [31922, 31923, 31925, 31927]
  ): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: kinds,
      authors: [await this.getPublicKey()],
    };

    try {
      // Get relays from kind 10002 relay list metadata
      const relays = await this.getRelays();

      log.info("Querying calendar events", {
        kinds,
        relays,
        sinceDate: since ? new Date(since * 1000).toISOString() : undefined,
        untilDate: until ? new Date(until * 1000).toISOString() : undefined,
      });

      // Query deletion events first to filter out deleted events
      const deletedIds = await this.queryDeletionEvents();

      // Query public events
      const publicEvents = await this.pool.querySync(relays, filter);
      log.info(`Found ${publicEvents.length} public calendar events`);

      // Query private events (only calendar event kinds, exclude 31927 which is always public)
      const privateKinds = kinds.filter((k) => k !== 31927);
      let privateEvents: NostrEvent[] = [];

      if (privateKinds.length > 0) {
        privateEvents = await this.queryPrivateEvents(privateKinds);
        log.info(`Found ${privateEvents.length} private calendar events`);
      }

      // Combine public and private events
      const allEvents = [...publicEvents, ...privateEvents];
      log.info(
        `Total ${allEvents.length} events before deletion filter (${publicEvents.length} public, ${privateEvents.length} private)`
      );

      // Filter out deleted events
      const events = allEvents.filter((event) => {
        if (deletedIds.has(event.id)) {
          log.debug(`Excluding deleted event ${event.id.slice(0, 8)}`);
          return false;
        }
        return true;
      });

      log.info(`${events.length} events after filtering out ${deletedIds.size} deletions`);

      // Log details of all events found
      events.forEach((event) => {
        const tags = new Map(event.tags.map((tag) => [tag[0], tag.slice(1)]));
        const startTag = tags.get("start")?.[0];
        const endTag = tags.get("end")?.[0];
        const title = tags.get("title")?.[0];
        log.debug(`Event kind ${event.kind}`, {
          id: event.id.slice(0, 8),
          title,
          start: startTag,
          end: endTag,
          createdAt: new Date(event.created_at * 1000).toISOString(),
        });
      });

      // Filter by actual event start times if date range specified
      if (since !== undefined || until !== undefined) {
        const filtered = events.filter((event) => {
          const tags = new Map(event.tags.map((tag) => [tag[0], tag.slice(1)]));
          const startTag = tags.get("start")?.[0];

          if (!startTag) {
            log.debug(`Event ${event.id.slice(0, 8)} has no start tag, excluding`);
            return false;
          }

          // Parse start timestamp (could be unix timestamp or ISO date)
          const eventStart = startTag.includes("-")
            ? Math.floor(new Date(startTag).getTime() / 1000)
            : parseInt(startTag);

          const included = !(
            (since !== undefined && eventStart < since) ||
            (until !== undefined && eventStart > until)
          );

          log.debug(`Event ${event.id.slice(0, 8)} ${included ? "INCLUDED" : "EXCLUDED"}`, {
            eventStart: new Date(eventStart * 1000).toISOString(),
            queryRange: {
              since: since ? new Date(since * 1000).toISOString() : "none",
              until: until ? new Date(until * 1000).toISOString() : "none",
            },
          });

          return included;
        });
        log.info(`Filtered to ${filtered.length} events in date range`);
        return filtered;
      }

      return events;
    } catch (error) {
      log.error("Error querying calendar events", error);
      throw error;
    }
  }

  /**
   * Get a specific event by ID (for looking up parent events of RSVPs)
   */
  async getEventById(eventId: string): Promise<NostrEvent | null> {
    try {
      const relays = await this.getRelays();
      const event = await this.pool.get(relays, {
        ids: [eventId],
      });
      return event;
    } catch (error) {
      log.error("Error fetching event by ID", error);
      return null;
    }
  }

  /**
   * Query kind 10050 (DM relay list) for a user to get their preferred relays for gift wraps
   * Uses default relays to bootstrap the query
   */
  async queryRelayList(pubkey: string): Promise<string[]> {
    try {
      log.info(`Querying kind 10050 relay list for ${pubkey.slice(0, 8)}`);

      const event = await this.pool.get(this.defaultRelays, {
        kinds: [10050],
        authors: [pubkey],
      });

      if (!event) {
        log.info(`No kind 10050 relay list found for ${pubkey.slice(0, 8)}, will use default relays`);
        return [];
      }

      const relayTags = event.tags.filter((tag) => tag[0] === "relay");
      const relays = relayTags.map((tag) => tag[1]).filter((url): url is string => !!url);

      log.info(`Found kind 10050 with ${relays.length} relays for ${pubkey.slice(0, 8)}`, {
        relays,
        eventId: event.id.slice(0, 8),
      });
      return relays;
    } catch (error) {
      log.error("Error querying relay list", error);
      return [];
    }
  }

  /**
   * Query and unwrap private events from gift wraps (kind 1059)
   * Uses kind 10050 relays if available, falls back to kind 10002, then default relays
   * @param allowedKinds - Optional array of kinds to filter for. If not provided, returns all unwrapped events
   */
  async queryPrivateEvents(allowedKinds?: number[]): Promise<NostrEvent[]> {
    try {
      const myPubkey = await this.getPublicKey();

      // First, get own kind 10050 relay list
      const privateRelays = await this.queryRelayList(myPubkey);

      // Fallback: kind 10050 → kind 10002 → default relays
      let relaysToQuery: string[];
      if (privateRelays.length > 0) {
        relaysToQuery = privateRelays;
      } else {
        const relayMetadata = await this.queryRelayListMetadata(myPubkey);
        relaysToQuery = relayMetadata.length > 0 ? relayMetadata : this.defaultRelays;
      }

      const source =
        privateRelays.length > 0
          ? "kind 10050"
          : relaysToQuery === this.defaultRelays
          ? "default"
          : "kind 10002";
      log.info(`Querying private events (kind 1059) from ${relaysToQuery.length} relays (${source}):`, {
        relays: relaysToQuery,
        recipientPubkey: myPubkey.slice(0, 8),
      });

      // Query kind 1059 gift wraps addressed to us
      const giftWraps = await this.pool.querySync(relaysToQuery, {
        kinds: [1059],
        "#p": [myPubkey],
      });

      log.info(`Found ${giftWraps.length} gift wraps`, {
        wrapIds: giftWraps.map((wrap) => wrap.id.slice(0, 8)),
      });

      // Unwrap each gift wrap to get the actual events
      const unwrappedEvents: NostrEvent[] = [];
      for (const wrap of giftWraps) {
        try {
          if (this.authType === "nsec" && this.secretKey) {
            const rumor = nip59.unwrapEvent(wrap, this.secretKey);

            // Filter by allowed kinds if specified
            if (!allowedKinds || allowedKinds.includes(rumor.kind)) {
              unwrappedEvents.push(rumor as NostrEvent);
              log.debug(`Unwrapped ${rumor.kind} event`, {
                id: rumor.id.slice(0, 8),
                kind: rumor.kind,
              });
            }
          } else if (this.authType === "bunker" && this.bunker) {
            // For bunker auth, we need to decrypt the wrap manually
            // This requires implementing manual unwrapping with bunker.nip44Decrypt
            log.warn("Bunker-based unwrapping not yet implemented for received events");
          }
        } catch (error) {
          log.debug("Failed to unwrap gift wrap", { error });
        }
      }

      log.info(`Unwrapped ${unwrappedEvents.length} private events`);
      return unwrappedEvents;
    } catch (error) {
      log.error("Error querying private events", error);
      return [];
    }
  }

  /**
   * Parse calendar events into standardized format with timing info
   */
  parseCalendarEvents(events: NostrEvent[]): ParsedCalendarEvent[] {
    return events
      .map((event) => {
        try {
          return this.parseEvent(event);
        } catch (error) {
          log.warn("Failed to parse event", { eventId: event.id, error });
          return null;
        }
      })
      .filter((e): e is ParsedCalendarEvent => e !== null);
  }

  /**
   * Parse a single event
   */
  private parseEvent(event: NostrEvent): ParsedCalendarEvent | null {
    const tags = new Map(event.tags.map((tag) => [tag[0], tag.slice(1)]));
    const kind = event.kind as CalendarEventKind;

    switch (kind) {
      case 31922: // Date-based event
        return this.parseDateBasedEvent(event, tags);
      case 31923: // Time-based event
        return this.parseTimeBasedEvent(event, tags);
      case 31925: // RSVP (requires parent lookup)
        return this.parseRSVP(event, tags);
      case 31927: // Availability block
        return this.parseAvailabilityBlock(event, tags);
      default:
        return null;
    }
  }

  private parseDateBasedEvent(event: NostrEvent, tags: Map<string, string[]>): ParsedCalendarEvent {
    const startDate = tags.get("start")?.[0];
    const endDate = tags.get("end")?.[0] || startDate;
    const title = tags.get("title")?.[0];

    if (!startDate) throw new Error("Date-based event missing start date");

    return {
      id: event.id,
      kind: 31922,
      title,
      start: new Date(startDate),
      end: new Date(endDate!),
    };
  }

  private parseTimeBasedEvent(event: NostrEvent, tags: Map<string, string[]>): ParsedCalendarEvent {
    const startTs = tags.get("start")?.[0];
    const endTs = tags.get("end")?.[0];
    const title = tags.get("title")?.[0];
    const timezone = tags.get("start_tzid")?.[0];

    if (!startTs) throw new Error("Time-based event missing start timestamp");

    return {
      id: event.id,
      kind: 31923,
      title,
      start: new Date(parseInt(startTs) * 1000),
      end: endTs ? new Date(parseInt(endTs) * 1000) : new Date(parseInt(startTs) * 1000),
      timezone,
    };
  }

  private parseRSVP(event: NostrEvent, tags: Map<string, string[]>): ParsedCalendarEvent | null {
    const status = tags.get("status")?.[0] as "accepted" | "declined" | "tentative" | undefined;
    const parentRef = tags.get("a")?.[0]; // Format: "kind:pubkey:d-tag"

    // Only mark as busy if accepted
    if (status !== "accepted") {
      return null;
    }

    // For RSVPs, we need to look up the parent event to get timing
    // This will be handled in CalendarService
    return {
      id: event.id,
      kind: 31925,
      status,
      parentEventRef: parentRef,
      start: new Date(0), // Placeholder - will be filled from parent event
      end: new Date(0), // Placeholder
    };
  }

  private parseAvailabilityBlock(event: NostrEvent, tags: Map<string, string[]>): ParsedCalendarEvent {
    const startTs = tags.get("start")?.[0];
    const endTs = tags.get("end")?.[0];

    if (!startTs || !endTs) throw new Error("Availability block missing start or end");

    return {
      id: event.id,
      kind: 31927,
      start: new Date(parseInt(startTs) * 1000),
      end: new Date(parseInt(endTs) * 1000),
    };
  }

  /**
   * Create and publish a time-based calendar event (kind 31923)
   * Private events use NIP-59 gift wrapping to encrypt and send to participants
   */
  async createCalendarEvent(params: {
    title: string;
    description: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    location?: string;
    attendees?: string[]; // npub strings
    private?: boolean; // Default to true for privacy
  }): Promise<string> {
    const isPrivate = params.private ?? true; // Default to private

    const eventTemplate: Partial<UnsignedEvent> = {
      kind: 31923 as const,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", crypto.randomUUID()], // Unique identifier
        ["title", params.title],
        ["start", Math.floor(params.startTime.getTime() / 1000).toString()],
        ["end", Math.floor(params.endTime.getTime() / 1000).toString()],
        ["start_tzid", params.timezone],
        ["end_tzid", params.timezone],
      ] as [string, ...string[]][],
      content: params.description,
    };

    // Add optional tags
    if (params.location) {
      eventTemplate.tags!.push(["location", params.location]);
    }

    // Parse attendees and add p tags
    const participantPubkeys: string[] = [];
    const myPubkey = await this.getPublicKey();

    // Always add organizer (self) as a participant for private events
    if (isPrivate) {
      eventTemplate.tags!.push(["p", myPubkey, "", "organizer"]);
      // Note: wrapManyEvents automatically includes sender, so we don't add to participantPubkeys
    }

    if (params.attendees) {
      for (const attendee of params.attendees) {
        try {
          const decoded = nip19.decode(attendee);
          if (decoded.type === "npub") {
            const pubkey = decoded.data as string;
            // Only add if not already the organizer
            if (pubkey !== myPubkey) {
              eventTemplate.tags!.push(["p", pubkey, "", "required"]);
              participantPubkeys.push(pubkey);
            }
          }
        } catch {
          log.warn("Invalid npub for attendee", attendee);
        }
      }
    }

    if (isPrivate) {
      // Private event: use NIP-59 gift wrapping
      log.info("Creating private calendar event with gift wrapping", {
        participants: participantPubkeys.length,
        organizer: myPubkey.slice(0, 8),
      });

      // Log the unsigned event being wrapped
      log.info("Unsigned event to be wrapped (rumor):", {
        kind: eventTemplate.kind,
        created_at: eventTemplate.created_at,
        tags: eventTemplate.tags,
        content: eventTemplate.content,
      });

      try {
        // wrapManyEvents requires at least one recipient
        // If no external participants (self-booking), pass [self] to satisfy the requirement
        const recipients = participantPubkeys.length > 0 ? participantPubkeys : [myPubkey];

        log.info(`Creating gift wraps for recipients:`, {
          recipients: recipients.map((r) => r.slice(0, 8)),
        });

        // Create gift wraps - different method for bunker vs nsec
        let giftWraps: NostrEvent[];

        if (this.authType === "bunker" && this.bunker) {
          // Use manual gift wrapping for bunker
          giftWraps = await this.createGiftWrapWithBunker(eventTemplate, recipients);
        } else if (this.authType === "nsec" && this.secretKey) {
          // Use standard nip59 for nsec
          giftWraps = nip59.wrapManyEvents(eventTemplate, this.secretKey, recipients);
        } else {
          throw new Error("No valid authentication method available");
        }

        log.info(`Created ${giftWraps.length} gift wraps`);

        // Publish each gift wrap to the appropriate relay
        const publishPromises: Promise<void>[] = [];

        for (let i = 0; i < giftWraps.length; i++) {
          const wrap = giftWraps[i];
          const pTag = wrap.tags.find(([key]) => key === "p");
          const recipientPubkey = pTag?.[1];

          if (!recipientPubkey) continue;

          log.info(`Gift wrap ${i + 1}/${giftWraps.length} details:`, {
            wrapId: wrap.id.slice(0, 8),
            kind: wrap.kind,
            recipient: recipientPubkey.slice(0, 8),
            created_at: wrap.created_at,
            pubkey: wrap.pubkey.slice(0, 8),
            tags: wrap.tags,
          });

          // Query recipient's kind 10050 relay list
          const recipientRelays = await this.queryRelayList(recipientPubkey);

          // Fallback: kind 10050 → kind 10002 → default relays
          let targetRelays: string[];
          let relaySource: string;
          if (recipientRelays.length > 0) {
            targetRelays = recipientRelays;
            relaySource = "kind 10050";
          } else {
            const recipientMetadata = await this.queryRelayListMetadata(recipientPubkey);
            if (recipientMetadata.length > 0) {
              targetRelays = recipientMetadata;
              relaySource = "kind 10002";
            } else {
              targetRelays = this.defaultRelays;
              relaySource = "default";
            }
          }

          log.info(
            `Publishing gift wrap ${i + 1} to ${
              targetRelays.length
            } relays (${relaySource}) for ${recipientPubkey.slice(0, 8)}:`,
            {
              relays: targetRelays,
            }
          );

          // Publish to recipient's relays
          publishPromises.push(
            Promise.any(this.pool.publish(targetRelays, wrap))
              .then(() => {
                log.info(`✓ Gift wrap ${i + 1} delivered successfully to ${recipientPubkey.slice(0, 8)}`);
              })
              .catch((err) => {
                log.warn(`✗ Failed to deliver gift wrap ${i + 1} to ${recipientPubkey.slice(0, 8)}`, err);
              })
          );
        }

        // Wait for all publishes to complete
        await Promise.allSettled(publishPromises);

        log.info("Private calendar event published successfully");

        // Return the rumor's ID by unwrapping the first gift wrap (sent to ourselves)
        if (this.authType === "nsec" && this.secretKey) {
          const selfWrap = giftWraps[0]; // First one is always for sender
          const rumor = nip59.unwrapEvent(selfWrap, this.secretKey);
          return rumor.id;
        } else {
          // For bunker, we can't unwrap easily, so generate a deterministic ID
          // This is acceptable since the event was published
          const tempId = crypto.randomUUID();
          log.info("Generated temp ID for bunker event", { tempId });
          return tempId;
        }
      } catch (error) {
        log.error("Error creating private calendar event", error);
        throw error;
      }
    } else {
      // Public event: sign and publish normally
      let signedEvent: NostrEvent;

      if (this.authType === "bunker" && this.bunker) {
        signedEvent = await this.bunker.signEvent(eventTemplate as UnsignedEvent);
      } else if (this.authType === "nsec" && this.secretKey) {
        signedEvent = finalizeEvent(eventTemplate as UnsignedEvent, this.secretKey);
      } else {
        throw new Error("No valid authentication method available");
      }

      try {
        const relays = await this.getRelays();
        log.debug("Publishing public calendar event", { eventId: signedEvent.id, relays });
        await Promise.any(this.pool.publish(relays, signedEvent));
        log.debug("Public calendar event published successfully");
        return signedEvent.id;
      } catch (error) {
        log.error("Error publishing public calendar event", error);
        throw error;
      }
    }
  }

  /**
   * Create and publish an availability block (kind 31927)
   */
  async createAvailabilityBlock(params: { startTime: Date; endTime: Date }): Promise<string> {
    const eventTemplate = {
      kind: 31927 as const,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", crypto.randomUUID()],
        ["start", Math.floor(params.startTime.getTime() / 1000).toString()],
        ["end", Math.floor(params.endTime.getTime() / 1000).toString()],
      ] as [string, ...string[]][],
      content: "",
    };

    let signedEvent: NostrEvent;

    if (this.authType === "bunker" && this.bunker) {
      signedEvent = await this.bunker.signEvent(eventTemplate);
    } else if (this.authType === "nsec" && this.secretKey) {
      signedEvent = finalizeEvent(eventTemplate, this.secretKey);
    } else {
      throw new Error("No valid authentication method available");
    }

    try {
      const relays = await this.getRelays();
      log.debug("Publishing availability block", { eventId: signedEvent.id, relays });
      await Promise.any(this.pool.publish(relays, signedEvent));
      log.debug("Availability block published successfully");
      return signedEvent.id;
    } catch (error) {
      log.error("Error publishing availability block", error);
      throw error;
    }
  }

  /**
   * Delete an event (NIP-09)
   */
  async deleteEvent(eventId: string, reason?: string): Promise<void> {
    const eventTemplate = {
      kind: 5 as const,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", eventId]] as [string, ...string[]][],
      content: reason || "",
    };

    let signedEvent: NostrEvent;

    if (this.authType === "bunker" && this.bunker) {
      signedEvent = await this.bunker.signEvent(eventTemplate);
    } else if (this.authType === "nsec" && this.secretKey) {
      signedEvent = finalizeEvent(eventTemplate, this.secretKey);
    } else {
      throw new Error("No valid authentication method available");
    }

    try {
      const relays = await this.getRelays();
      log.debug("Publishing deletion event", { targetEventId: eventId, relays });
      await Promise.any(this.pool.publish(relays, signedEvent));
      log.debug("Deletion event published successfully");
    } catch (error) {
      log.error("Error publishing deletion event", error);
      throw error;
    }
  }

  /**
   * Delete availability blocks (kind 31927) matching specific start/end times
   */
  async deleteAvailabilityBlocksByTime(startTime: Date, endTime: Date): Promise<void> {
    try {
      const relays = await this.getRelays();

      const startTs = Math.floor(startTime.getTime() / 1000).toString();
      const endTs = Math.floor(endTime.getTime() / 1000).toString();

      log.info("Querying availability blocks to delete", {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      // Query all kind 31927 availability blocks by this user
      const blocks = await this.pool.querySync(relays, {
        kinds: [31927],
        authors: [await this.getPublicKey()],
      });

      log.debug(`Found ${blocks.length} availability blocks to check`);

      // Find blocks matching the exact start/end times
      const matchingBlocks = blocks.filter((block) => {
        const tags = new Map(block.tags.map((tag) => [tag[0], tag.slice(1)]));
        const blockStart = tags.get("start")?.[0];
        const blockEnd = tags.get("end")?.[0];

        return blockStart === startTs && blockEnd === endTs;
      });

      log.info(`Found ${matchingBlocks.length} matching availability blocks to delete`);

      // Delete each matching block
      for (const block of matchingBlocks) {
        await this.deleteEvent(block.id, "Availability block cancelled");
        log.debug(`Deleted availability block ${block.id.slice(0, 8)}`);
      }
    } catch (error) {
      log.error("Error deleting availability blocks by time", error);
      throw error;
    }
  }

  /**
   * Close all relay connections
   */
  close(): void {
    const allRelays = this.relayListMetadata
      ? Array.from(new Set([...this.defaultRelays, ...this.relayListMetadata]))
      : this.defaultRelays;
    this.pool.close(allRelays);
  }
}
