import { AppRouterI18nContext } from "@calcom/web/app/AppRouterI18nProvider";
import { renderHook } from "@testing-library/react-hooks";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { useLocale } from "./useLocale";

describe("useLocale", () => {
  it("does not HTML-escape interpolated values", () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        AppRouterI18nContext.Provider,
        { value: { locale: "en", ns: "common", translations: { hosted_by: "Hosted by {{name}}" } } },
        children
      );

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.t("hosted_by", { name: "Conan O'Brien & Co" })).toBe(
      "Hosted by Conan O'Brien & Co"
    );
  });
});
