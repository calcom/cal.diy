# embed-core

This is the vanilla JS core script that embeds Cal Link.

## How to use embed on any webpage no matter what framework

See <https://developer.cal.com/embed/install-with-javascript>

You can also see various example usages [here](https://github.com/calcom/cal.diy/blob/main/packages/embeds/embed-core/index.html)

## Development

Run the following command and then you can test the embed in the automatically opened page `http://localhost:3100/embed/`
We have another html page to specifically test prerendering when using headless router in Demo `http://localhost:3100/embed/routing-playground.html`

```bash
yarn dev
```

## Running Tests

Ensure that the main App is running on port 3000 (e.g. yarn dx) already. Also ensure dev server for embed-core is running and then run the following command:
Start the server on 3100 port

```bash
yarn dev
```

And from another terminal you can run the following command to execute tests:

```bash
yarn embed-tests-quick
```

Note: `getEmbedIframe` and `addEmbedListeners` work as a team but they only support opening up embed in a fresh load. Opening an embed closing it and then opening another embed isn't supported yet.

## Shipping to Production

```bash
yarn build
```

Make `dist/embed.umd.js` servable on URL <http://cal.com/embed.js>

## DX

- Hot reload doesn't work with CSS files in the way we use vite.

## Steps to make a page compatible with Embed

- Define `main` class on the element that has the entire content of the page with no auto margins
  - Adding `main` class allows iframe height to adjust according to it, making sure that the content within `main` is visible without scrolling as long as device dimensions permit it.
  - It also becomes the area beyond which if the user clicks, modal-box would close.

## Known Bugs and Upcoming Improvements

- Unsupported Browsers and versions. Documenting them and gracefully handling that.
- Need to create a booking Shell so that common changes for embed can be applied there.

- Accessibility and UI/UX Issues
  let the user choose the loader for ModalBox
  If the website owner links the booking page directly for an event, should the user be able to go to events-listing page using back button ?
  Let the user specify both dark and light theme colors. Right now the colors specified are for light theme.

  - Transparent support is not properly done for team links
  - Maybe don't set border-radius in inline mode or give an option to configure border-radius.

- Branding

  - Powered by Cal.diy and 'Try it for free'. Should they be shown only for FREE account.
  - Branding at the bottom has been removed for UI improvements, need to see where to add it.

- API

  - Allow loader color customization using UI command itself too. Right now it's possible using CSS only.

- Automation Tests

  - Run automation tests in CI
  - Automation Tests are using snapshots of Booking Page which has current month which requires us to regenerate snapshots every month.

- Bundling Related

  - Comments in CSS aren't stripped off

- Debuggability

  - Send log messages from iframe to parent so that all logs can exist in a single queue forming a timeline.
    - user should be able to use "on" instruction to understand what's going on in the system
  - Error Tracking for embed.js
    - Know where exactly it’s failing if it does.

- Color Scheme

  - Need to reduce the number of colors on booking page, so that UI configuration is simpler

- Dev Experience/Ease of Installation

  - Do we need a one liner(like `window.dataLayer.push`) to inform SDK of something even if snippet is not yet on the page but would be there e.g. through GTM it would come late on the page ?

- Option to disable redirect banner and let parent handle redirect.

- Release Issues

  - Compatibility Issue - When embed-iframe.js is updated in such a way that it is not compatible with embed.js, doing a release might break the embed for some time. e.g. iframeReady event let's say gets changed to something else
    - Best Case scenario - App and Website goes live at the same time. A website using embed loads the same updated and thus compatible versions of embed.js and embed-iframe.js
    - Worst case scenario - App goes live first, website PR isn't merged yet and thus a website using the embed would load updated version of embed-iframe but outdated version of embed.js possibly breaking the embed.
    - Ideal Solution: It would be to keep the libraries versioned and embed.js should instruct app within iframe to load a particular version. But if we push a security fix, it is possible that someone is still enforcing embed to load version with security issue. Need to handle this.
    - Quick Solution: Serve embed.js also from app, so that they go live together and there is only a slight chance of compatibility issues on going live. Note, that they can still occur as 2 different requests are sent at different times to fetch the libraries and deployments can go live in between,

- UI Config Features

  - How would the user add on hover styles just using style attribute ?

- If just iframe refreshes due to some reason, embed script can't replay the applied instructions.

- React Component
  - `onClick` support with automatic preloading
- Shadow DOM is currently in open state, which probably means that any styling change on website can impact loader.

## Pending Documentation

- READMEs
  - How to make a new element configurable using UI instruction ?
  - Why do we NOT want to provide completely flexible CSS customization by adding whatever CSS user wants. ?
  - Feature Documentation
    - Inline mode doesn't cause any scroll in iframe by default. It looks like it is part of the website.
- Wiki (https://github.com/OpenCal-Community/cal.diy/wiki)

  - A complete document on how to use embed

- app.cal.com
  - Get Embed code for each event-type
