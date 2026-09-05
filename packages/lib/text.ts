export const truncate = (text: string, maxLength: number, ellipsis = true) => {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 3)}${ellipsis ? "..." : ""}`;
};

export const truncateOnWord = (text: string, maxLength: number, ellipsis = true) => {
  if (text.length <= maxLength) return text;

  // First split on maxLength chars
  let truncatedText = text.substring(0, maxLength);

  // Then split on the last space, this way we split on the last word,
  // which looks just a bit nicer.
  truncatedText = truncatedText.substring(0, Math.min(truncatedText.length, truncatedText.lastIndexOf(" ")));

  if (ellipsis) truncatedText += "...";

  return truncatedText;
};
