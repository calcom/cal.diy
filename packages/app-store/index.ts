// Dynamically import app store components to eliminate local dev compilation bottlenecks
import dynamic from "next/dynamic";

export const appStoreMap = {
  stripepayment: dynamic(() => import("./stripepayment/components/EventTypeAppCardInterface")),
  salesforce: dynamic(() => import("./salesforce/components/EventTypeAppCardInterface")),
  hubspot: dynamic(() => import("./hubspot/components/EventTypeAppCardInterface")),
  paypal: dynamic(() => import("./paypal/components/EventTypeAppCardInterface")),
  office365video: dynamic(() => import("./office365video/components/InstallAppButton")),
};

export * from "./apps.browser.generated";
export default appStoreMap;
