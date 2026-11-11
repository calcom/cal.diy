/**
 * Creates a JSON replacer that handles BigInts, nested Errors, and true circular references.
 *
 * Circularity is decided against the current ancestor chain rather than a set of every value
 * already seen, so a value referenced twice as a sibling (a DAG, not a cycle) still serializes
 * in full. `JSON.stringify` invokes the replacer with `this` bound to the holder of `value`,
 * which is what lets the chain be unwound to the current parent.
 */
function getCircularReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const ancestors: unknown[] = [];

  return function (this: unknown, _key: string, value: unknown) {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }

    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.indexOf(value) !== -1) {
      return "[Circular]";
    }
    ancestors.push(value);

    return value;
  };
}

/**
 * Safely serializes an unknown value into a JSON string.
 *
 * Guarantees a string return value for logging systems (such as Axiom or Winston),
 * preventing unhandled exceptions from circular references, BigInt values, or throwing getters.
 *
 * @param obj - The value to stringify.
 * @returns The JSON string representation of the value, or a fallback string if serialization fails.
 *
 * @example
 * ```ts
 * safeStringify({ a: 1, b: BigInt(42) }); // '{"a":1,"b":"42"}'
 *
 * const circular: any = { name: "test" };
 * circular.self = circular;
 * safeStringify(circular); // '{"name":"test","self":"[Circular]"}'
 *
 * safeStringify(new Error("Something failed")); // '"Error: Something failed\n..."'
 * ```
 */
export function safeStringify(obj: unknown): string {
  try {
    if (obj instanceof Error) {
      // Errors don't serialize well, so we extract the stack or message
      return JSON.stringify(obj.stack ?? obj.message);
    }
    const result = JSON.stringify(obj, getCircularReplacer());
    if (result !== undefined) {
      return result;
    }
    return String(obj);
  } catch {
    try {
      return String(obj);
    } catch {
      return "[Unserializable]";
    }
  }
}
