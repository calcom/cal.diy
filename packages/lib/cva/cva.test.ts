import { describe, expect, it } from "vitest";
import { applyStyleToMultipleVariants } from "./cva";

describe("CVA Utils", () => {
  it("Should return an array of all possible variants", () => {
    const variants = {
      color: ["blue", "red"],
      size: ["small", "medium", "large"],
      className: "text-blue w-10",
    };

    const result = applyStyleToMultipleVariants(variants);
    expect(result).toEqual([
      { color: "blue", size: "small", className: "text-blue w-10" },
      { color: "blue", size: "medium", className: "text-blue w-10" },
      { color: "blue", size: "large", className: "text-blue w-10" },
      { color: "red", size: "small", className: "text-blue w-10" },
      { color: "red", size: "medium", className: "text-blue w-10" },
      { color: "red", size: "large", className: "text-blue w-10" },
    ]);
  });

  it("Should not error when no arrays are passed in", () => {
    const variants = {
      color: "blue",
      size: "large",
      className: "text-blue w-10",
    };

    const result = applyStyleToMultipleVariants(variants);
    expect(result).toEqual([{ color: "blue", size: "large", className: "text-blue w-10" }]);
  });

  it("Should accept numbers, null values, booleans and undefined in arrays as well", () => {
    const variants = {
      color: ["blue", null],
      size: ["small", 30, false, undefined],
      className: "text-blue w-10",
    };

    const result = applyStyleToMultipleVariants(variants);
    expect(result).toEqual([
      { color: "blue", size: "small", className: "text-blue w-10" },
      { color: "blue", size: 30, className: "text-blue w-10" },
      { color: "blue", size: false, className: "text-blue w-10" },
      { color: "blue", size: undefined, className: "text-blue w-10" },
      { color: null, size: "small", className: "text-blue w-10" },
      { color: null, size: 30, className: "text-blue w-10" },
      { color: null, size: false, className: "text-blue w-10" },
      { color: null, size: undefined, className: "text-blue w-10" },
    ]);
  });
});
