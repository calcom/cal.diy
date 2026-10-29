// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type ValidationSchemaPropType = string | Function;

export type ValidationSchema = {
  required?: boolean;
  props?: Record<
    string,
    ValidationSchema & {
      type: ValidationSchemaPropType | readonly ValidationSchemaPropType[];
    }
  >;
};

/**
 * A very simple data validator written with intention of keeping payload size low.
 * Extend the functionality of it as required by the embed.
 *
 * Special types supported:
 * - "calLink": Validates a non-empty relative Cal link identifier.
 *   Rejects absolute paths (starting with `/`) and any URI scheme
 *   such as `https:`, `http:`, `ftp:`, `mailto:`, or `javascript:`.
 */
export function validate(data: Record<string, unknown>, schema: ValidationSchema): void {
  function checkType(value: unknown, expectedType: ValidationSchemaPropType): boolean {
    if (expectedType === "calLink") {
      const trimmed = typeof value === "string" ? value.trim() : "";

      return trimmed.length > 0 && !/^(?:[\\/]|[a-z][a-z0-9+.-]*:)/i.test(trimmed);
    }

    if (typeof expectedType === "string") {
      return typeof value === expectedType;
    } else {
      return value instanceof expectedType;
    }
  }

  function isUndefined(val: unknown): val is undefined {
    return typeof val === "undefined";
  }

  if (schema.required && isUndefined(data)) {
    throw new Error("Argument is required");
  }

  const props = schema.props || {};
  for (const prop in props) {
    const propSchema = props[prop];
    if (propSchema.required && isUndefined(data[prop])) {
      throw new Error(`"${prop}" is required`);
    }
    let typeCheck = true;
    if (propSchema.type && !isUndefined(data[prop])) {
      if (Array.isArray(propSchema.type)) {
        typeCheck = propSchema.type.some((type: ValidationSchemaPropType) => {
          return checkType(data[prop], type);
        });
      } else {
        typeCheck = checkType(data[prop], propSchema.type as ValidationSchemaPropType);
      }
    }
    if (!typeCheck) {
      throw new Error(`"${prop}" is of wrong type.Expected type "${propSchema.type}"`);
    }
  }
}
