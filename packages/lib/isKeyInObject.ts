/**
 * Type guard that checks if a given property key exists as an own property on an object.
 *
 * Safely guards against `null`, `undefined`, and non-object primitives, preventing runtime
 * `TypeError: Cannot use 'in' operator` exceptions. Also prevents prototype chain leaks
 * (such as `"toString"`, `"valueOf"`, or `"constructor"` on empty objects).
 *
 * @param k - The property key to check (string, number, or symbol).
 * @param o - The target value or object to test.
 * @returns `true` if `o` is a non-null object and `k` is an own property of `o`, `false` otherwise.
 *
 * @example
 * ```ts
 * const user = { name: "Alice", role: "admin" };
 * if (isKeyInObject("role", user)) {
 *   console.log(user.role); // Typed as keyof user
 * }
 *
 * isKeyInObject("toString", {}); // false (avoids prototype leaks)
 * isKeyInObject("id", null); // false (safe null check)
 * isKeyInObject("id", undefined); // false (safe undefined check)
 * ```
 */
export const isKeyInObject = <T extends object>(k: PropertyKey, o: T | null | undefined): k is keyof T => {
  if (!o || typeof o !== "object") {
    return false;
  }

  return Object.hasOwn(o, k);
};
