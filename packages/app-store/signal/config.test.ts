import { describe, expect, it } from "vitest";
import { guessEventLocationType } from "../locations";
import signalConfig from "./config.json";

const signalUrlRegExp: RegExp = new RegExp(signalConfig.appData.location.urlRegExp);
const signalLocationType: string = signalConfig.appData.location.type;

describe("Signal location urlRegExp", () => {
  it("accepts Signal Create a Call Link URLs (signal.link)", () => {
    expect(
      signalUrlRegExp.test("https://signal.link/call/#key=cqbt-rflr-fckd-korn-mkhz-pgqb-sxrk-sght")
    ).toBe(true);
  });

  it("accepts signal.me profile and username URLs", () => {
    expect(signalUrlRegExp.test("https://signal.me/#p/+11234567890")).toBe(true);
    expect(
      signalUrlRegExp.test(
        "https://signal.me/#eu/5dMcfwB-qD8jHCexHsjD1kiRAF6pwSiC03Abcf4dGztkJJWslUpMTY3IIPknYQil"
      )
    ).toBe(true);
    expect(signalUrlRegExp.test("http://www.signal.me/#p/+11234567890")).toBe(true);
  });

  it("rejects lookalike domains that are not signal.me or signal.link", () => {
    expect(signalUrlRegExp.test("https://signalame.com/#p/+11234567890")).toBe(false);
    expect(signalUrlRegExp.test("https://signalXme/#p/+11234567890")).toBe(false);
    expect(signalUrlRegExp.test("https://signal-me/#p/+11234567890")).toBe(false);
    expect(signalUrlRegExp.test("https://signal.me.evil.com/call/#key=abc")).toBe(false);
    expect(signalUrlRegExp.test("https://signal.link.evil.com/call/#key=abc")).toBe(false);
    expect(signalUrlRegExp.test("https://notsignal.link/call/#key=abc")).toBe(false);
  });
});

describe("guessEventLocationType for Signal URLs", () => {
  it("recognizes a Signal call link as the Signal location type", () => {
    const guessed = guessEventLocationType(
      "https://signal.link/call/#key=cqbt-rflr-fckd-korn-mkhz-pgqb-sxrk-sght"
    );
    expect(guessed?.type).toBe(signalLocationType);
  });

  it("recognizes a signal.me URL as the Signal location type", () => {
    const guessed = guessEventLocationType("https://signal.me/#p/+11234567890");
    expect(guessed?.type).toBe(signalLocationType);
  });

  it("does not treat lookalike domains as Signal", () => {
    expect(guessEventLocationType("https://signalame.com/#p/+11234567890")?.type).not.toBe(
      signalLocationType
    );
    expect(guessEventLocationType("https://signalXme/#p/+11234567890")?.type).not.toBe(signalLocationType);
    expect(guessEventLocationType("https://signal.link.evil.com/call/#key=abc")?.type).not.toBe(
      signalLocationType
    );
  });
});
