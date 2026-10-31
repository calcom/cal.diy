/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 *
 * Supports primitives, NaN equality, Date objects, RegExp instances, Arrays, plain Objects and
 * class instances. Exotic built-ins such as Map and Set compare as unequal unless they are the
 * same reference.
 * Distinguishes between arrays and plain objects, and handles edge cases such as invalid dates.
 *
 * @param value - The first value to compare.
 * @param other - The second value to compare.
 * @returns `true` if the values are equivalent, `false` otherwise.
 *
 * @example
 * ```ts
 * isEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] }); // true
 * isEqual(new Date("2024-01-01"), new Date("2024-01-01")); // true
 * isEqual(new Date("2020-01-01"), new Date("2026-12-31")); // false
 * isEqual(/abc/g, /abc/g); // true
 * isEqual(NaN, NaN); // true
 * isEqual([1], { 0: 1 }); // false
 * isEqual(new Map([["a", 1]]), new Map()); // false
 * ```
 */
export function isEqual(value: unknown, other: unknown): boolean {
  // Handle identical references and identical primitive values
  if (value === other) return true;

  // Handle NaN (in JS, NaN !== NaN)
  if (typeof value === "number" && typeof other === "number" && Number.isNaN(value) && Number.isNaN(other)) {
    return true;
  }

  // Handle null or undefined (since value !== other, if either is nullish they are not equal)
  if (value == null || other == null) return false;

  // Different primitive types cannot be equal
  if (typeof value !== typeof other) return false;

  // If not an object, they are unequal primitives
  if (typeof value !== "object" || typeof other !== "object") return false;

  // Handle Date instances
  if (value instanceof Date || other instanceof Date) {
    if (!(value instanceof Date) || !(other instanceof Date)) return false;
    const timeA = value.getTime();
    const timeB = other.getTime();
    return timeA === timeB || (Number.isNaN(timeA) && Number.isNaN(timeB));
  }

  // Handle RegExp instances
  if (value instanceof RegExp || other instanceof RegExp) {
    if (!(value instanceof RegExp) || !(other instanceof RegExp)) return false;
    return value.source === other.source && value.flags === other.flags;
  }

  // Handle arrays (ensure array vs plain object distinction)
  const isArrayValue = Array.isArray(value);
  const isArrayOther = Array.isArray(other);
  if (isArrayValue || isArrayOther) {
    if (!isArrayValue || !isArrayOther) return false;
    if (value.length !== other.length) return false;
    return value.every((val, i) => isEqual(val, other[i]));
  }

  // Anything past this point is compared by its own enumerable keys, which describes plain
  // objects and class instances but not exotic built-ins: two Maps or Sets both report zero
  // own keys, so a key-based comparison would call every pair of them equal. Refuse those
  // rather than answer wrongly; identical references already returned true above.
  const valueTag = Object.prototype.toString.call(value);
  if (valueTag !== Object.prototype.toString.call(other) || valueTag !== "[object Object]") {
    return false;
  }

  // Handle plain objects
  const valueKeys = Object.keys(value as object);
  const otherKeys = Object.keys(other as object);

  if (valueKeys.length !== otherKeys.length) return false;

  return valueKeys.every((key) => {
    if (!Object.hasOwn(other, key)) return false;
    return isEqual((value as Record<string, unknown>)[key], (other as Record<string, unknown>)[key]);
  });
}
