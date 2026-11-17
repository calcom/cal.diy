import { useEmbedTheme } from "@calcom/embed-core/embed-iframe";
import { localStorage } from "@calcom/lib/webstorage";
import { useTheme as useNextTheme } from "next-themes";
import { useEffect } from "react";

/**
 * It should be called once per route if you intend to use a theme different from `system` theme. `system` theme is automatically supported using <ThemeProvider />
 * If needed you can also set system theme by passing 'system' as `themeToSet`
 * It handles embed configured theme automatically
 * To just read the values pass `getOnly` as `true` and `themeToSet` as `null`
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export default function useTheme(themeToSet: "system" | (string & {}) | undefined | null, getOnly = false) {
  if (typeof window !== "undefined") {
    const themeFromLocalStorage = localStorage.getItem("app-theme");
    themeToSet = themeToSet ?? themeFromLocalStorage ?? "system";
  }
  const { resolvedTheme, setTheme, forcedTheme, theme: activeTheme } = useNextTheme();
  const embedTheme = useEmbedTheme();

  useEffect(() => {
    // Undefined themeToSet allow the hook to be used where the theme is fetched after calling useTheme hook
    if (getOnly || themeToSet === undefined) {
      return;
    }

    // Embed theme takes precedence over theme configured in app.
    // If embedTheme isn't set i.e. it's not explicitly configured with a theme, then it would use the theme configured in appearance.
    // If embedTheme is set to "auto" then we consider it as null which then uses system theme.
    const finalThemeToSet = embedTheme ? (embedTheme === "auto" ? "system" : embedTheme) : themeToSet;

    if (!finalThemeToSet || finalThemeToSet === activeTheme) return;

    setTheme(finalThemeToSet);
    // We must not add `activeTheme` to the dependency list as it can cause an infinite loop b/w dark and theme switches
    // because there might be another booking page with conflicting theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeToSet, setTheme, embedTheme]);

  if (getOnly) {
    return {
      resolvedTheme,
      forcedTheme,
      activeTheme,
    };
  }

  return;
}

/**
 * Returns the currently set theme values.
 */
export function useGetTheme() {
  const theme = useTheme(null, true);
  if (!theme) {
    throw new Error("useTheme must have a return value here");
  }
  return theme;
}
