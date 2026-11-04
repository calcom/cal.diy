# What TOAB Jitsi accesses in Cal.com

When you install TOAB Jitsi for Cal.com and add it to an event type, the app gets access to the data below. This is what each item is for.

| Access | Why we need it |
|---|---|
| **Install on your account or team**<br>App installation record | To make TOAB Jitsi available as a video location for your event types. Only you, or a team admin for team event types, can install it. No passwords or tokens of yours are stored in it. |
| **Read the event type you're editing**<br>Owner, team, hosts and locations | To check that you own the event type or are an admin of its team, and that "TOAB Jitsi Video" is its selected location. |
| **Save your server choice on the event type**<br>Event type app settings | To remember which Jitsi server you picked, and your TOAB Jitsi account ID, so each booking uses that server. |
| **See the organizer's email address**<br>Owner's email, or the first host's email for team event types | To find the organizer's TOAB Jitsi account and list the Jitsi servers they can choose from. |
| **Read the booking when it's created**<br>Booking ID and unique booking ID | To create a meeting for that booking. Only these two IDs, your TOAB Jitsi account ID and your chosen server are sent to our servers. |
| **Add the meeting link to the booking**<br>Booking video location | So you and your attendees get the Jitsi link in the booking confirmation and calendar invite. |
| **Know when a booking is cancelled**<br>Unique booking ID | To cancel the matching Jitsi meeting on our servers. |
| **Connect to external services**<br>TOAB Moderator API, via an Auth0 machine-to-machine login | To reach our backend service, which creates and cancels meetings and lists your Jitsi servers. These credentials are set by your Cal.com administrator, are never sent to your browser, and are never stored on your event types. |

We only use your Cal.com data to add and manage Jitsi meetings. We never send our servers your bookings' titles, descriptions, times, attendee names or emails, or booking answers, and we never access your calendars or contacts.

We never sell your data, share it for advertising, or use it to train AI models.

You can uninstall the app and remove its access at any time, and ask us to delete your data. For full details, read our Privacy Policy.
