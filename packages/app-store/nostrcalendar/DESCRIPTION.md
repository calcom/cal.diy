---
items:
  - 1.jpeg
  - 2.jpeg
  - 3.jpeg
---

# Nostr Calendar

Sync your Cal.com bookings with Nostr using the NIP-52 calendar events specification.

## What it does

When someone books a meeting with you on Cal.com, this app:
- Publishes a private NIP-59 gift-wrapped calendar event (kind 31923) to your Nostr relays
- Creates a public availability block (kind 31927) to mark you as busy
- Checks your existing Nostr calendar events to prevent double-bookings

## Authentication

Choose how you want to connect:

**Bunker (recommended)** - Connect a remote signer like nsec.app or Amber. Your keys stay in the signer and never touch Cal.com's servers.

**Private Key (nsec)** - Provide your nsec key directly. It's encrypted before storage using the same encryption Cal.com uses for other integrations.

## Setup

1. Install the app from the Cal.com app store
2. Choose bunker or nsec authentication
3. Enable "Check for conflicts" in your calendar settings to sync availability
4. Done - your relay list is automatically discovered from your kind 10002 metadata

## Privacy

By default, calendar events are created as private NIP-59 gift-wrapped events. Event details are encrypted and only visible to participants. A public availability block (kind 31927) is created so others can see you're busy without seeing the event details.

## Implementation

Implements the following Nostr specs:
- NIP-52 (Calendar Events)
- NIP-46 (Nostr Connect / bunker)
- NIP-59 (Gift Wrap for private events)
- NIP-44 (Encrypted payloads)
- NIP-09 (Event deletion)

Supports all NIP-52 event types: date-based (31922), time-based (31923), RSVPs (31925), and availability blocks (31927).

## Learn More

- [NIP-52 Specification](https://github.com/nostr-protocol/nips/blob/master/52.md)
- [Nostr Protocol](https://nostr.com)
