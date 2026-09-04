// Canonical implementation — also duplicated in packages/prisma/zod-utils.ts (keep in sync)
export function isPasswordValid(password: string): boolean;
export function isPasswordValid(
  password: string,
  breakdown: boolean,
  strict?: boolean
): { caplow: boolean; num: boolean; min: boolean; admin_min: boolean };
export function isPasswordValid(password: string, breakdown?: boolean, strict?: boolean) {
  let cap = false, // Has uppercase characters
    low = false, // Has lowercase characters
    num = false, // At least one number
    min = false, // Eight characters, or fifteen in strict mode.
    admin_min = false;
  if (password.length >= 7 && (!strict || password.length > 14)) min = true;
  if (strict && password.length > 14) admin_min = true;
  if (password.match(/\d/)) num = true;
  if (password.match(/\p{Ll}/u)) low = true;
  if (password.match(/\p{Lu}/u)) cap = true;

  if (!breakdown) return cap && low && num && min && (strict ? admin_min : true);

  let errors: Record<string, boolean> = { caplow: cap && low, num, min };
  // Only return the admin key if strict mode is enabled.
  if (strict) errors = { ...errors, admin_min };

  return errors;
}
