import { useBrandColors } from "@calcom/embed-core/embed-iframe";
import { DEFAULT_DARK_BRAND_COLOR, DEFAULT_LIGHT_BRAND_COLOR } from "./constants";

const BRAND_COLOR = DEFAULT_LIGHT_BRAND_COLOR;
const DARK_BRAND_COLOR = DEFAULT_DARK_BRAND_COLOR;

type Rgb = {
  r: number;
  g: number;
  b: number;
};

/**
 * Given a html color name, check if it exists in our color palette
 * and if it does, return the hex code for that color. Otherwise,
 * return the default brand color.
 */
export function fallBackHex(val: string | null, dark: boolean): string {
  if (val && isValidHexCode(val)) {
    return val;
  }
  return dark ? DARK_BRAND_COLOR : BRAND_COLOR;
}

export function isValidHexCode(hexColor: string): boolean {
  // Regular expression for hex color code pattern
  const hexColorPattern = /^#([0-9A-Fa-f]{3}){1,2}$/;

  // Check if hex color code matches pattern
  const isHexColor = hexColorPattern.test(hexColor);

  return isHexColor;
}

// credit : https://github.com/validatorjs/validator.js/blob/master/src/lib/isHexColor.js
const getValidHEX = (hex: string, defaultHex: string): string => {
  const hexColor = /^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(hex.replace("##", "#"));
  if (hexColor) {
    return hex;
  }
  return defaultHex;
};

function hexToRgb(hex: string): Rgb {
  const sanitizedHex = hex.replace("##", "#");
  const colorParts = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(sanitizedHex);

  if (!colorParts) {
    throw new Error("Invalid Hex colour");
  }

  const [, r, g, b] = colorParts;

  return {
    r: parseInt(r, 16),
    g: parseInt(g, 16),
    b: parseInt(b, 16),
  } as Rgb;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lighten(hex: string, intensity: number): string {
  const color = hexToRgb(`#${hex}`);

  if (!color) {
    return "";
  }

  const r = Math.round(color.r + (255 - color.r) * intensity);
  const g = Math.round(color.g + (255 - color.g) * intensity);
  const b = Math.round(color.b + (255 - color.b) * intensity);

  return rgbToHex(r, g, b);
}

function darken(hex: string, intensity: number): string {
  const color = hexToRgb(hex);

  if (!color) {
    return "";
  }

  const r = Math.round(color.r * intensity);
  const g = Math.round(color.g * intensity);
  const b = Math.round(color.b * intensity);

  return rgbToHex(r, g, b);
}

function normalizeHexCode(hex: string | null, dark: boolean) {
  if (!hex) {
    return !dark ? BRAND_COLOR : DARK_BRAND_COLOR;
  }

  hex = hex.replace("#", "");

  // If the length of the hex code is 3, double up each character
  // e.g. fff => ffffff or a0e => aa00ee
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((hex) => hex + hex)
      .join("");
  }

  return hex;
}

export const createColorMap = (brandColor: string) => {
  const response: Record<string, string> = {
    500: `#${brandColor}`.replace("##", "#"),
  };
  const intensityMap: {
    [key: number]: number;
  } = {
    50: 0.95,
    100: 0.9,
    200: 0.75,
    300: 0.6,
    400: 0.3,
    600: 0.9,
    700: 0.75,
    800: 0.6,
    900: 0.49,
  };

  [50, 100, 200, 300, 400].forEach((level) => {
    response[level] = lighten(brandColor, intensityMap[level]);
  });

  [600, 700, 800, 900].forEach((level) => {
    response[level] = darken(brandColor, intensityMap[level]);
  });
  return response;
};

function getWCAGContrastColor(background: string): string {
  // Convert the hex background color to RGB
  const { r, g, b } = hexToRgb(background);
  // Calculate the luminance of the background color
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // If the luminance is less than 0.5, use white as the text color, otherwise use black
  return luminance < 0.5 ? "#FFFFFF" : "#000000";
}

export function checkWCAGContrastColor(background: string, target: string) {
  const backgroundRGB = hexToRgb(background);
  const targetRGB = hexToRgb(target);
  const bgLuminance = (0.2126 * backgroundRGB.r + 0.7152 * backgroundRGB.g + 0.0722 * backgroundRGB.b) / 255;
  const targetLuminance = (0.2126 * targetRGB.r + 0.7152 * targetRGB.g + 0.0722 * targetRGB.b) / 255;

  const contrastRadio =
    (Math.max(bgLuminance, targetLuminance) + 0.05) / (Math.min(targetLuminance, bgLuminance) + 0.05);

  const MIN_CONTRAST_RATIO = 4.5; // used for BGs

  return contrastRadio >= MIN_CONTRAST_RATIO;
}

/**
 * Given a light and dark brand color value, update the css variables
 * within the document to reflect the new brand colors.
 */
const useGetBrandingColours = ({
  lightVal = BRAND_COLOR,
  darkVal = DARK_BRAND_COLOR,
}: {
  lightVal: string | undefined | null;
  darkVal: string | undefined | null;
}) => {
  const embedBrandingColors = useBrandColors();

  lightVal = embedBrandingColors.brandColor || lightVal;

  // convert to 6 digit equivalent if 3 digit code is entered
  lightVal = normalizeHexCode(lightVal, false);

  darkVal = normalizeHexCode(darkVal, true);

  const lightColourMap = createColorMap(getValidHEX(lightVal, BRAND_COLOR));
  const darkColourMap = createColorMap(getValidHEX(darkVal, DARK_BRAND_COLOR));

  const theme = {
    light: {
      "cal-brand": lightColourMap["500"],
      "cal-brand-emphasis": lightColourMap["400"],
      "cal-brand-subtle": lightColourMap["200"],
      "cal-brand-text": getWCAGContrastColor(lightColourMap["500"]),
      "cal-brand-accent": getWCAGContrastColor(lightColourMap["500"]),
    },
    dark: {
      "cal-brand": darkColourMap["500"],
      "cal-brand-emphasis": darkColourMap["600"],
      "cal-brand-subtle": darkColourMap["800"],
      "cal-brand-text": getWCAGContrastColor(darkColourMap["500"]),
      "cal-brand-accent": getWCAGContrastColor(darkColourMap["500"]),
    },
  };
  return theme;
};

export default useGetBrandingColours;
