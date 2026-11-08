import { createServerFn } from "@tanstack/react-start";
// Only referenced inside the handler, so the server-only catalog code stays out of the client bundle.
import { pickMessages } from "./catalog";

// POST, not GET: a GET server function puts its input in the URL, and the event type editor
// needs enough keys to push the request past Node's 16 KB header limit once a proxy such as
// Cloudflare Tunnel adds its own headers (431 Request Header Fields Too Large).
export const getMessages = createServerFn({ method: "POST" })
  .validator((input: { locale: string; keys: readonly string[] }) => input)
  .handler(({ data }) => pickMessages(data.locale, data.keys));
