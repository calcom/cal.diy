import { UiConfig } from "../types";

/**
 * Maps old CSS variable names to new Tailwind v4 variable names.
 * This maintains backward compatibility by allowing users to use old variable names
 * while the webapp uses the new Tailwind v4 format.
 * 
 * This is only applicable as long as fundamentally the purpose of the variable is the same.
 * In some cases, we have special classes designed to target specific elements e.g. border-booker class which is configured to use variable --cal-border-booker. 
 * In those special cases, we need to ensure that we don't remove those special css variables. Renaming them is fine and in which case we would need to map them here.
 * 
 */
const OLD_TO_NEW_CSS_VAR_MAP: Record<string, string> = {
    // Border radius variables: --cal-radius-* -> --radius-*
    "cal-radius": "radius",
    "cal-radius-sm": "radius-sm",
    "cal-radius-md": "radius-md",
    "cal-radius-lg": "radius-lg",
    "cal-radius-xl": "radius-xl",
    "cal-radius-2xl": "radius-2xl",
    "cal-radius-3xl": "radius-3xl",
    "cal-radius-full": "radius-full",
    "cal-radius-none": "radius-none",
    "cal-availability-dot-color": "availability-dot-color",
    // No need to map the following
    // Colors - Still using the old variable names --cal-bg-* and --cal-brand-*
    // Border colors - Still using the old variable names --cal-border-*
    // text colors - Still using the old variable names --cal-text-*
    // fill colors - Still using the old variable names --cal-fill-*
};

/**
 * Transforms cssVarsPerTheme by mapping old CSS variable names to new Tailwind v4 names.
 * This ensures backward compatibility while the webapp uses the new variable format.
 */
export function mapOldToNewCssVars(
    cssVarsPerTheme: UiConfig["cssVarsPerTheme"]
): UiConfig["cssVarsPerTheme"] {
    if (!cssVarsPerTheme) {
        return cssVarsPerTheme;
    }

    const mapped: Record<string, Record<string, string>> = {};

    for (const [theme, cssVars] of Object.entries(cssVarsPerTheme)) {
        mapped[theme] = {};
        for (const [varName, value] of Object.entries(cssVars)) {
            // If the variable name exists in the mapping, use the new name; otherwise keep the original
            const newVarName = OLD_TO_NEW_CSS_VAR_MAP[varName];
            if (!newVarName) {
                mapped[theme][varName] = value
                continue;
            }
            console.log("Mapped variable:", varName, "to", newVarName);
            mapped[theme][newVarName] = value;
        }
    }

    return mapped as UiConfig["cssVarsPerTheme"];
}