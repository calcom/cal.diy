# Simple Analytics

[Simple Analytics](https://simpleanalytics.com) is privacy-first web analytics from the EU. It works without cookies, so booking pages need no consent banner.

This app loads the Simple Analytics script on the booking pages of the event types you enable it for.

## Installation

1. Add your website to your [Simple Analytics dashboard](https://dashboard.simpleanalytics.com). Use the hostname you want booking traffic to appear under, for example `example.com`.
2. Install the Simple Analytics app from the App Store.
3. Open an event type, go to the **Apps** tab and turn on Simple Analytics.
4. Enter the same hostname and save.

## What is collected

- **Page views** of the booking page, recorded under the hostname you entered.
- **Booking events**, when "Collect booking events" is on (the default):

  | Event                 | Sent when                |
  | --------------------- | ------------------------ |
  | `booking_completed`   | a booking is completed   |
  | `booking_rescheduled` | a booking is rescheduled |
  | `booking_cancelled`   | a booking is cancelled   |

  Each event includes this [metadata](https://docs.simpleanalytics.com/metadata) when available: `event_type_id`, `status`, `payment_required` and `is_recurring`. No attendee names, email addresses or booking answers are sent.

Visitors with Do Not Track enabled are skipped unless you turn on "Collect Do Not Track visits".

## Links

- Website: https://simpleanalytics.com
- Documentation: https://docs.simpleanalytics.com
- Events: https://docs.simpleanalytics.com/events
- Support: support@simpleanalytics.com
