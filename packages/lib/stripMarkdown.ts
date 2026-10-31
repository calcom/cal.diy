import removeMd from "remove-markdown";

/**
 * Strips Markdown formatting from a string, returning plain text.
 *
 * remove-markdown calls .replace() on whatever it is handed, so anything that is not a string
 * reaches it as a TypeError rather than a return value.
 *
 * @param md - The Markdown string to strip.
 * @returns Plain text without Markdown formatting, or an empty string for anything unusable.
 */
export function stripMarkdown(md?: string | null): string {
  if (typeof md !== "string" || md === "") {
    return "";
  }
  return removeMd(md);
}
