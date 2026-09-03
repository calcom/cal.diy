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
  const lastSpaceIndex = truncatedText.lastIndexOf(" ");
  if (lastSpaceIndex !== -1) {
    truncatedText = truncatedText.substring(0, lastSpaceIndex);
  }

  if (ellipsis) truncatedText += "...";

  return truncatedText;
};
