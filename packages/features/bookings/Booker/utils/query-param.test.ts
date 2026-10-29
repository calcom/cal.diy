// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { removeQueryParam } from "./query-param";

describe("removeQueryParam", () => {
  it("removes parameters with empty values", () => {
    window.history.replaceState(null, "", "/pro/30min?date=");
    removeQueryParam("date");

    expect(new URL(window.location.href).searchParams.has("date")).toBe(false);
  });

  it("leaves the URL unchanged when the parameter is absent", () => {
    window.history.replaceState(null, "", "/pro/30min");
    const currentUrl = window.location.href;
    removeQueryParam("date");

    expect(window.location.href).toBe(currentUrl);
  });
});
