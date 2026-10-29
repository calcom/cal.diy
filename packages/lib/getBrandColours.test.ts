import { describe, expect, it } from "vitest";

import { checkWCAGContrastColor, createColorMap } from "./getBrandColours";

describe("useGetBrandingColours", () => {
  it("should return the correct color values for given lightVal and darkVal", () => {
    const expectedResult = {
      light: {
        "50": "#fff3f3",
        "100": "#ffe8e8",
        "200": "#ffc5c5",
        "300": "#ffa2a2",
        "400": "#ff5c5c",
        "500": "#ff1616",
        "600": "#e61414",
        "700": "#bf1111",
        "800": "#990d0d",
        "900": "#7d0b0b",
      },
      dark: {
        "50": "#f2f5ff",
        "100": "#e6ecff",
        "200": "#bfcfff",
        "300": "#99b3ff",
        "400": "#4d79ff",
        "500": "#0040ff",
        "600": "#003ae6",
        "700": "#0030bf",
        "800": "#002699",
        "900": "#001f7d",
      },
      // ...
    };

    const lightMap = createColorMap("#ff1616");
    const darkMap = createColorMap("#0040ff");

    expect(lightMap).toEqual(expectedResult.light);
    expect(darkMap).toEqual(expectedResult.dark);
  });
});

describe("checkWCAGContrastColor", () => {
  it("uses WCAG relative luminance for the contrast ratio", () => {
    // #767676 on white is 4.54:1 and #777777 on #101010 is 4.25:1 per WCAG 2
    expect(checkWCAGContrastColor("#ffffff", "#767676")).toBe(true);
    expect(checkWCAGContrastColor("#101010", "#777777")).toBe(false);
  });
});
