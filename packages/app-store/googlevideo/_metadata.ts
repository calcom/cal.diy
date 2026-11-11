import process from "node:process";
import { validJson } from "@calcom/lib/jsonUtils";
import type { AppMeta } from "@calcom/types/App";

export const metadata = {
  name: "Google Meet",
  description:
    "Google Meet is Google's web-based video conferencing platform, designed to compete with major conferencing platforms.",
  installed: !!(process.env.GOOGLE_API_CREDENTIALS && validJson(process.env.GOOGLE_API_CREDENTIALS)),
  slug: "google-meet",
  category: "conferencing",
  categories: ["conferencing"],
  type: "google_video",
  title: "Google Meet",
  variant: "conferencing",
  logo: "logo.webp",
  publisher: "Cal.diy",
  url: "https://cal.com/",
  isGlobal: false,
  email: "help@cal.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:google:meet",
      label: "Google Meet",
      urlRegExp: "^https?:\\/\\/(?:www\\.)?meet\\.google\\.com\\/[a-zA-Z0-9-_]+",
    },
  },
  dirName: "googlevideo",
  dependencies: ["google-calendar"],
  isOAuth: false,
} as AppMeta;

export default metadata;
