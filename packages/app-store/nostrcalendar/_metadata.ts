import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Nostr",
  description: _package.description,
  installed: true,
  type: "nostr_calendar",
  title: "Nostr Calendar",
  variant: "calendar",
  category: "calendar",
  categories: ["calendar"],
  logo: "icon.svg",
  publisher: "NostrCal.com",
  slug: "nostr",
  url: "https://nostr.com",
  email: "hello@nostrcal.com",
  dirName: "nostrcalendar",
  isOAuth: false,
} as AppMeta;

export default metadata;
