import type { AppMeta } from "@calcom/types/App";

export const metadata = {
  name: "SquadCast",
  description:
    "High-quality audio and video content with our in-browser software for premium recordings auto-saved with cloud storage.",
  installed: false,
  type: "squadcast_conferencing",
  variant: "conferencing",
  categories: ["conferencing"],
  logo: "icon.svg",
  publisher: "Bandhan Majumder",
  url: "https://squadcast.fm",
  slug: "squadcast",
  title: "SquadCast",
  isGlobal: false,
  email: "bandhan.majumder4@gmail.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:squadcast_conferencing",
      label: "SquadCast",
    },
  },
  dirName: "squadcast",
  isOAuth: false,
} as AppMeta;

export default metadata;
