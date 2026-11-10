---
name: calcom-api
description: Interact with the Cal.diy API v2 to manage scheduling, bookings, event types, availability, and calendars. Use this skill when building integrations that need to create or manage bookings, check availability, configure event types, or sync calendars with Cal.diy's scheduling infrastructure.
env:
  CAL_API_KEY:
    description: "Cal.diy API key (prefixed with cal_live_ or cal_test_). Required for all API requests."
    required: true
  CAL_CLIENT_ID:
    description: "OAuth client ID for platform integrations managing users on behalf of others. Sent as x-cal-client-id header."
    required: false
  CAL_SECRET_KEY:
    description: "OAuth client secret for platform integrations. Sent as x-cal-secret-key header."
    required: false
  CAL_WEBHOOK_SECRET:
    description: "Secret used to verify webhook payload signatures via X-Cal-Signature-256 header."
    required: false
---

# Cal.diy API v2

This skill provides guidance for AI agents to interact with the Cal.diy API v2, enabling scheduling automation, booking management, and calendar integrations.

## Base URL

All API requests should be made to:
```
https://api.cal.com/v2
```

## Required Credentials

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `CAL_API_KEY` | Yes | Cal.diy API key (prefixed with `cal_live_` or `cal_test_`). Used as Bearer token for all API requests. Generate from Settings > Developer > API Keys. |
| `CAL_CLIENT_ID` | No | OAuth client ID for platform integrations that manage users on behalf of others. Sent as `x-cal-client-id` header. |
| `CAL_SECRET_KEY` | No | OAuth client secret for platform integrations. Sent as `x-cal-secret-key` header. |
| `CAL_WEBHOOK_SECRET` | No | Secret for verifying webhook payload signatures via the `X-Cal-Signature-256` header. |

## Authentication

All API requests require authentication via Bearer token:

```
Authorization: Bearer cal_<your_api_key>
```

For detailed authentication methods including OAuth/Platform authentication, see `references/authentication.md`.

## Core Concepts

**Event Types** define bookable meeting configurations (duration, location, availability rules). Each event type has a unique slug used in booking URLs.

**Bookings** are confirmed appointments created when someone books an event type. Each booking has a unique UID for identification.

**Schedules** define when a user is available for bookings. Users can have multiple schedules with different working hours.

**Slots** represent available time windows that can be booked based on event type configuration and user availability.

## Reference Documentation

This skill includes detailed API reference documentation for each domain:

| Reference | Description |
|-----------|-------------|
| `references/authentication.md` | API key and OAuth authentication, rate limiting, security best practices |
| `references/bookings.md` | Create, list, cancel, reschedule bookings |
| `references/event-types.md` | Configure bookable meeting types |
| `references/schedules.md` | Manage user availability schedules |
| `references/slots-availability.md` | Query available time slots |
| `references/calendars.md` | Calendar connections and busy times |
| `references/webhooks.md` | Real-time event notifications |

## Quick Start

### 1. Check Available Slots

Before creating a booking, check available time slots:

```http
GET /v2/slots?startTime=2024-01-15T00:00:00Z&endTime=2024-01-22T00:00:00Z&eventTypeId=123
```

See `references/slots-availability.md` for full details.

### 2. Create a Booking

```http
POST /v2/bookings
Content-Type: application/json

{
  "start": "2024-01-15T10:00:00Z",
  "eventTypeId": 123,
  "attendee": {
    "name": "John Doe",
    "email": "john@example.com",
    "timeZone": "America/New_York"
  }
}
```

See `references/bookings.md` for all booking operations.

### 3. Set Up Webhooks

Receive real-time notifications for booking events:

```http
POST /v2/webhooks
Content-Type: application/json

{
  "subscriberUrl": "https://your-app.com/webhook",
  "triggers": ["BOOKING_CREATED", "BOOKING_CANCELLED"]
}
```

See `references/webhooks.md` for available triggers and payload formats.

## Common Workflows

**Book a meeting**: Check slots -> Create booking -> Store booking UID

**Reschedule**: Get new slots -> POST /v2/bookings/{uid}/reschedule

**Cancel**: POST /v2/bookings/{uid}/cancel with optional reason

## Best Practices

1. Always check slot availability before creating bookings
2. Store booking UIDs for future operations (cancel, reschedule)
3. Use ISO 8601 format for all timestamps
4. Implement webhook handlers for real-time updates
5. Handle rate limiting with exponential backoff

## Additional Resources

- [Full API Reference](https://github.com/OpenCal-Community/cal.diy/wiki/API-v2)
- [OpenAPI Specification](https://api.cal.com/v2/docs)
