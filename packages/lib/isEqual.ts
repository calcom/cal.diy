export function isEqual(value: unknown, other: unknown): boolean {
  // Handle null/undefined
  if (value === other) return true;
  if (value == null || other == null) return false;

  // Handle arrays
  if (Array.isArray(value) && Array.isArray(other)) {
    if (value.length !== other.length) return false;
    return value.every((val, i) => isEqual(val, other[i]));
  }

  // Handle objects
  if (typeof value === "object" && typeof other === "object") {
    const valueKeys = Object.keys(value);
    const otherKeys = Object.keys(other);

    if (valueKeys.length !== otherKeys.length) return false;

    return valueKeys.every((key) => {
      if (!Object.hasOwn(other, key)) return false;
      return isEqual((value as Record<string, unknown>)[key], (other as Record<string, unknown>)[key]);
    });
  }

  return value === other;
}
