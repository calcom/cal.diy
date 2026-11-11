import type { AppMeta } from "@calcom/types/App";

export const metadata = {
  name: "Stablezact",
  description:
    "Accept cryptocurrency payments directly to your wallet. Support for USDT, USDC, and more across multiple blockchains.",
  installed: true,
  slug: "stablezact",
  category: "payment",
  categories: ["payment"],
  logo: "icon.png",
  publisher: "Stablezact Labs",
  title: "Stablezact Crypto Payments",
  type: "stablezact_payment",
  variant: "payment",
  extendsFeature: "EventType",
  url: "https://stablezact.com",
  email: "info@stablezact.com",
  dirName: "stablezact",
  isOAuth: false,
} as AppMeta;

export default metadata;
