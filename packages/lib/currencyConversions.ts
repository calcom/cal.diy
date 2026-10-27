const zeroDecimalCurrencies = [
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
];

/**
 * Converts an amount in currency to the smallest unit (e.g. cents).
 * For zero-decimal currencies (JPY, KRW, etc.), the amount remains unscaled.
 *
 * @param amount - The currency amount to convert.
 * @param currency - Optional 3-letter ISO currency code.
 * @returns The converted amount in the smallest currency unit.
 */
export const convertToSmallestCurrencyUnit = (amount: number, currency?: string) => {
  // Special cases
  if (currency && zeroDecimalCurrencies.includes(currency.toUpperCase())) {
    return amount;
  }
  return Math.round(amount * 100);
};

/**
 * Converts an amount from the smallest unit to a human-presentable currency unit.
 * For zero-decimal currencies (JPY, KRW, etc.), the amount is returned verbatim.
 * For standard currencies, the amount is divided by 100.
 *
 * @param amount - The currency amount in smallest units.
 * @param currency - Optional 3-letter ISO currency code.
 * @returns The converted presentable amount.
 */
export const convertFromSmallestToPresentableCurrencyUnit = (amount: number, currency?: string) => {
  // Special cases
  if (currency && zeroDecimalCurrencies.includes(currency.toUpperCase())) {
    return amount;
  }
  return amount / 100;
};

export const getCurrencySymbol = (currencyCode: string): string => {
  try {
    const formatter = Intl.NumberFormat("en", { style: "currency", currency: currencyCode });
    // formatToParts(1) breaks down the formatted number (1) into its constituent parts
    // like currency symbol, decimal separator, etc. We use 1 as it's a simple number
    // that will show the currency symbol clearly.
    // For example, since we are formatting the number 1 with USD currency, formatToParts(1) would return an array like:
    // [
    //   { type: "currency", value: "$" },
    //   { type: "integer", value: "1" },
    //   { type: "decimal", value: "." },
    //   { type: "fraction", value: "00" }
    // ]
    const parts = formatter.formatToParts(1);
    const currencyPart = parts.find((part) => part.type === "currency");
    return currencyPart?.value || "$";
  } catch {
    // Ideally we would not reach here, but if for some reason we reach here, we return
    // $ as default currency
    console.warn(`Failed to get currency symbol for ${currencyCode}, falling back to $`);
    return "$";
  }
};

export const formatPrice = (price: number, currency: string | undefined, locale = "en") => {
  switch (currency) {
    case "BTC":
      return `${price} sats`;
    default:
      currency = currency?.toUpperCase() || "USD";
      return `${Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
      }).format(convertFromSmallestToPresentableCurrencyUnit(price, currency))}`;
  }
};
