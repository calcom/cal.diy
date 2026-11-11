/**
 * Converts an iterable of key-value pairs into an object, grouping values with duplicate keys into an array.
 *
 * Similar to `Object.fromEntries()`, but preserves duplicate keys by converting their values
 * into arrays instead of overwriting earlier entries.
 *
 * Safely handles `null`, `undefined`, or empty iterables, and protects against prototype
 * pollution via `__proto__` and own-property collisions (e.g. a key named `"hasOwnProperty"`).
 *
 * @param entries - An iterable of `[key, value]` tuples (e.g. `URLSearchParams.entries()`, `Map.entries()`, or arrays), or null/undefined.
 * @returns A record mapping keys to single string values or arrays of string values.
 *
 * @example
 * ```ts
 * fromEntriesWithDuplicateKeys([["a", "1"], ["b", "2"]]);
 * // => { a: "1", b: "2" }
 *
 * fromEntriesWithDuplicateKeys([["tag", "dev"], ["tag", "oss"]]);
 * // => { tag: ["dev", "oss"] }
 *
 * fromEntriesWithDuplicateKeys(null);
 * // => {}
 * ```
 */
export function fromEntriesWithDuplicateKeys(
  entries?: Iterable<readonly [string, string]> | null
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  if (!entries) {
    return result;
  }

  // `for...of` over a bare Iterable needs downlevelIteration, which this repo does not enable
  // under its es5 target, so the entries are materialised first.
  for (const [key, value] of Array.from(entries)) {
    // Assigning "__proto__" on an object literal invokes the Object.prototype setter and can
    // replace the result's prototype, so that key is dropped. Every other key, "constructor"
    // included, only ever shadows an inherited member and is kept as ordinary data.
    if (key === "__proto__") {
      continue;
    }

    // result.hasOwnProperty(key) breaks once a param is itself named "hasOwnProperty".
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const currentValue = result[key];
      if (Array.isArray(currentValue)) {
        currentValue.push(value);
      } else {
        result[key] = [currentValue, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
