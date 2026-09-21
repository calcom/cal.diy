import { CONSOLE_URL, EMBED_LIB_URL, WEBAPP_URL, WEBSITE_URL } from "@calcom/lib/constants";
import { getTldPlus1 } from "@calcom/lib/getTldPlus1";

// It ensures that redirection URL safe where it is accepted through a query params or other means where user can change it.
export const getSafeRedirectUrl = (url = "") => {
  if (!url) {
    return null;
  }

  //It is important that this fn is given absolute URL because urls that don't start with HTTP can still deceive browser into redirecting to another domain
  if (url.search(/^https?:\/\//) === -1) {
    throw new Error("Pass an absolute URL");
  }

  const urlParsed = new URL(url);

  // Avoid open redirection security vulnerability
  if (![CONSOLE_URL, WEBAPP_URL, WEBSITE_URL].some((u) => new URL(u).origin === urlParsed.origin)) {
    url = `${WEBAPP_URL}/`;
  }

  return url;
};

// There is a copy of this fn at packages/embed/embed-core/src/preview.ts as that can't import this function. Keep it in sync
export function isSafeUrlToLoadResourceFrom(urlString: string) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    // Allow localhost for development
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }

    const webappUrl = new URL(WEBAPP_URL);
    const embedLibUrl = new URL(EMBED_LIB_URL);

    const urlTldPlus1 = getTldPlus1(url.hostname);
    const webappTldPlus1 = getTldPlus1(webappUrl.hostname);
    const embedLibTldPlus1 = getTldPlus1(embedLibUrl.hostname);

    // URLs must share the same TLD+1 so that org domains are also allowed.
    return [webappTldPlus1, embedLibTldPlus1].includes(urlTldPlus1);
  } catch {
    return false;
  }
}
