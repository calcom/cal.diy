import { md } from "@calcom/lib/markdownIt";
import sanitizeHtml from "sanitize-html";

if (typeof window !== "undefined") {
  // This file imports markdown parser which is a costly dependency, so we want to make sure it's not imported on the client side.
  // It is still imported at some places on client in non-booker pages, we can gradually remove it from there and then convert it into an error
  console.warn("`markdownToSafeHTML` should not be imported on the client side.");
}

export function markdownToSafeHTML(markdown: string | null) {
  if (!markdown) return "";

  const html = md.render(markdown);

  const safeHTML = sanitizeHtml(html);

  let safeHTMLWithListFormatting = safeHTML
    .replace(/<h1>/g, "<h1 style='font-size: 1.5em; font-weight: 700; margin-bottom: 8px'>")
    .replace(/<h2>/g, "<h2 style='font-size: 1.25em; font-weight: 700; margin-bottom: 6px'>")
    .replace(/<h3>/g, "<h3 style='font-size: 1.1em; font-weight: 600; margin-bottom: 4px'>")
    .replace(
      /<ul>/g,
      "<ul style='list-style-type: disc; list-style-position: inside; margin-left: 12px; margin-bottom: 4px'>"
    )
    .replace(
      /<ol>/g,
      "<ol style='list-style-type: decimal; list-style-position: inside; margin-left: 12px; margin-bottom: 4px'>"
    )
    .replace(/<a\s+href=/g, "<a target='_blank' class='text-blue-500 hover:text-blue-600' href=")
    .replace(/<h1[^>]*>/g, "<h1 style='font-size: 25px; font-weight: bold; margin-bottom: 8px'>")
    .replace(/<h2[^>]*>/g, "<h2 style='font-size: 20px; font-weight: bold; margin-bottom: 8px'>");

  // Match: <li>Some text </li><li><ul>...</ul></li>
  // Convert to: <li>Some text <ul>...</ul></li>
  safeHTMLWithListFormatting = safeHTMLWithListFormatting.replace(
    /<li>([^<]+|<strong>.*?<\/strong>)<\/li>\s*<li>\s*<ul([^>]*)>([\s\S]*?)<\/ul>\s*<\/li>/g,
    "<li>$1<ul$2>$3</ul></li>"
  );

  return safeHTMLWithListFormatting;
}