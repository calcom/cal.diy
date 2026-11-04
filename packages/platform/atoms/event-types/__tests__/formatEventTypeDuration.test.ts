import { describe, expect, it } from "vitest";

import { formatEventTypeDuration, formatEventTypeDurationAccessible } from "../lib/formatEventTypeDuration";

describe("formatEventTypeDuration", () => {
  it("should format single digit minutes", () => {
    expect(formatEventTypeDuration(5)).toBe("5m");
  });

  it("should format double digit minutes", () => {
    expect(formatEventTypeDuration(15)).toBe("15m");
    expect(formatEventTypeDuration(30)).toBe("30m");
    expect(formatEventTypeDuration(45)).toBe("45m");
  });

  it("should format edge case at 59 minutes", () => {
    expect(formatEventTypeDuration(59)).toBe("59m");
  });

  it("should handle edge case at 61 minutes", () => {
    expect(formatEventTypeDuration(61)).toBe("1h 1m");
  });

  it("should format single hour", () => {
    expect(formatEventTypeDuration(60)).toBe("1h");
  });

  it("should format multiple hours", () => {
    expect(formatEventTypeDuration(120)).toBe("2h");
    expect(formatEventTypeDuration(180)).toBe("3h");
    expect(formatEventTypeDuration(240)).toBe("4h");
  });

  it("should format hours with minutes", () => {
    expect(formatEventTypeDuration(75)).toBe("1h 15m");
    expect(formatEventTypeDuration(150)).toBe("2h 30m");
    expect(formatEventTypeDuration(195)).toBe("3h 15m");
  });

  it("should handle 1 minute", () => {
    expect(formatEventTypeDuration(1)).toBe("1m");
  });

  it("should handle zero minutes", () => {
    expect(formatEventTypeDuration(0)).toBe("0m");
  });
});

describe("formatEventTypeDurationAccessible", () => {
  it("should format single digit minutes", () => {
    expect(formatEventTypeDurationAccessible(5)).toBe("5 minutes");
  });

  it("should format 1 minute", () => {
    expect(formatEventTypeDurationAccessible(1)).toBe("1 minute");
  });

  it("should format 0 minutes", () => {
    expect(formatEventTypeDurationAccessible(0)).toBe("0 minutes");
  });

  it("should format single hour", () => {
    expect(formatEventTypeDurationAccessible(60)).toBe("1 hour");
  });

  it("should format multiple hours", () => {
    expect(formatEventTypeDurationAccessible(120)).toBe("2 hours");
  });

  it("should format hours with minutes", () => {
    expect(formatEventTypeDurationAccessible(90)).toBe("1 hour 30 minutes");
    expect(formatEventTypeDurationAccessible(75)).toBe("1 hour 15 minutes");
  });

  it("should support translation function", () => {
    const mockT = (key: string, options?: { count?: number }) => {
      const count = options?.count ?? 0;
      if (key === "minute") return count === 1 ? `${count} minuto` : `${count} minutos`;
      if (key === "hour") return count === 1 ? `${count} hora` : `${count} horas`;
      return key;
    };
    expect(formatEventTypeDurationAccessible(90, mockT)).toBe("1 hora 30 minutos");
    expect(formatEventTypeDurationAccessible(60, mockT)).toBe("1 hora");
    expect(formatEventTypeDurationAccessible(1, mockT)).toBe("1 minuto");
    expect(formatEventTypeDurationAccessible(0, mockT)).toBe("0 minutos");
  });
});
