export const truncate = (text: string, maxLength: number, ellipsis = true) => {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}${ellipsis ? "..." : ""}`;
};

export const truncateOnWord = (text: string, maxLength: number, ellipsis = true) => {
  if (text.length <= maxLength) return text;
  if (maxLength <= 0) return "";

  const suffix = ellipsis && maxLength >= 3 ? "..." : "";
  const budget = maxLength - suffix.length;

  const slice = text.substring(0, budget);
  const lastSpaceIndex = slice.lastIndexOf(" ");

  // Prefer breaking on a word boundary; fall back to a hard cut when text lacks spaces (e.g. CJK or URLs)
  const wordBoundary = lastSpaceIndex !== -1 ? lastSpaceIndex : budget;
  const truncatedText = slice.substring(0, wordBoundary);

  return `${truncatedText}${suffix}`;
};
