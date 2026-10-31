/**
 * Safely accesses a deeply nested property in an object using an array path.
 * Returns undefined if any part of the path is null, undefined, or not an object.
 *
 * @param obj - The object to retrieve the value from.
 * @param path - The array of keys or indices to traverse.
 * @returns The value at the specified path or undefined.
 */
export function getSafe<T>(obj: unknown, path?: (string | number)[] | null): T | undefined {
  if (!Array.isArray(path)) {
    return undefined;
  }

  return path.reduce<unknown>(
    (acc, key) =>
      typeof acc === "object" && acc !== null ? (acc as Record<string | number, unknown>)[key] : undefined,
    obj
  ) as T | undefined;
}
