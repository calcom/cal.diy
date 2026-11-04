# BubblaV

Connect your Cal.com account to [BubblaV](https://www.bubblav.com), an AI-powered
chatbot platform that learns from your website content, knowledge bases, and
support history to answer customer queries 24/7.

## Overview

This Cal.com app lets a Cal.com user connect their BubblaV account using OAuth.
The stored BubblaV credentials identify the connected BubblaV website.

> **Roadmap:** forwarding Cal.com booking lifecycle events (created / rescheduled
> / cancelled) to BubblaV — so BubblaV can capture each attendee as a lead — is
> planned for a follow-up. Cal.com delivers booking events only to URLs
> registered as Webhook subscriptions, so that feature needs a
> subscription-creation step and is intentionally not part of this initial
> integration.

## OAuth flow (Cal.com is the client, BubblaV is the server)

1. **Install** — Cal.com calls `GET <baseUrl>/api/integrations/bubblav/add` →
   returns the BubblaV authorize URL.
2. The installer is redirected to BubblaV
   (`…/api/integrations/calcom/oauth/authorize`), where they sign in, create or
   select a BubblaV website, and authorize.
3. BubblaV redirects back to `<baseUrl>/api/integrations/bubblav/callback` with
   an authorization code.
4. The callback exchanges the code at BubblaV's token endpoint and stores the
   BubblaV access/refresh tokens as a Cal.com credential.

## Configuration (Cal.com admin → App Keys)

Set the following under the BubblaV app keys (Admin → Developer):

| Key | Required | Description |
| --- | --- | --- |
| `client_id` | yes | BubblaV OAuth client id (BubblaV's `CALCOM_CLIENT_ID`) |
| `client_secret` | yes | BubblaV OAuth client secret (BubblaV's `CALCOM_CLIENT_SECRET`) |

On the BubblaV side, the same `client_id`/`client_secret` are configured as
`CALCOM_CLIENT_ID`/`CALCOM_CLIENT_SECRET`, and the redirect URI registered with
BubblaV is `<cal-webapp-url>/api/integrations/bubblav/callback`.

## Development

This app's OAuth flow mirrors the `intercom` and `lyra` apps. After editing,
regenerate the app-store wiring (`yarn app-store:build` / `yarn app-store:watch`)
so `apps.server.generated.ts` picks up the `bubblav` handlers, then run Cal.com
locally to test the install flow.
