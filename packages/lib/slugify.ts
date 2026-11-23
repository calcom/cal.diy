// forDisplayingInput is used to allow user to type "-" at the end and not replace with empty space.
// For eg:- "test-slug" is the slug user wants to set but while typing "test-" would get replace to "test" becauser of replace(/-+$/, "")

export const slugify = (str: string, forDisplayingInput?: boolean) => {
  if (!str) {
    return "";
  }

  const s = str
    .toLowerCase() // Convert to lowercase
    .trim() // Remove whitespace from both sides
    .normalize("NFD") // Normalize to decomposed form for handling accents
    // @ts-ignore - Unicode property escapes require ES6+ target in some TS configs
    .replace(/\p{Diacritic}/gu, "") // Remove any diacritics (accents) from characters
    // Remove emoji and pictographs (including skin tones, flags and joiner/variation selectors) up front so that they don't leave a dash behind.
    // We can't allow the whole \p{Emoji} class here instead, as it also matches "*", "#", digits, "©" and "®".
    .replace(
      // @ts-ignore - Unicode property escapes require ES6+ target in some TS configs
      /(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}]|\u200D|\uFE0F|\u20E3)+/gu,
      ""
    )
    // @ts-ignore - Unicode property escapes require ES6+ target in some TS configs
    .replace(/[^.\p{L}\p{N}\p{Zs}]+/gu, "-") // Replace any non-alphanumeric characters (including Unicode and except "." period) with a dash
    .replace(/[\s_#]+/g, "-") // Replace whitespace, # and underscores with a single dash
    .replace(/^-+/, "") // Remove dashes from start
    .replace(/\.{2,}/g, ".") // Replace consecutive periods with a single period
    .replace(/^\.+/, "") // Remove periods from the start
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ""
    ) // Removes emojis
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-"); // Replace consecutive dashes with a single dash

  return forDisplayingInput ? s : s.replace(/-+$/, "").replace(/\.*$/, ""); // Remove dashes and period from end
};

export default slugify;
