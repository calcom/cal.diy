import { getSafeConferencingRedirectUrl } from "./get-safe-conferencing-redirect-url";

describe("getSafeConferencingRedirectUrl", () => {
  const webappUrl = "http://localhost:3000";
  const fallbackUrl = `${webappUrl}/apps/installed/conferencing`;

  it("returns same-origin absolute URLs", () => {
    const url = `${webappUrl}/apps/installed/conferencing?hl=zoom`;

    expect(getSafeConferencingRedirectUrl(url, fallbackUrl, webappUrl)).toBe(url);
  });

  it("returns same-origin relative URLs", () => {
    const url = "/apps/installed/conferencing?hl=zoom";

    expect(getSafeConferencingRedirectUrl(url, fallbackUrl, webappUrl)).toBe(
      new URL(url, webappUrl).toString()
    );
  });

  it("falls back for external URLs", () => {
    expect(getSafeConferencingRedirectUrl("https://evil.com", fallbackUrl, webappUrl)).toBe(fallbackUrl);
  });

  it("falls back for invalid URLs", () => {
    expect(getSafeConferencingRedirectUrl("not a url", fallbackUrl, webappUrl)).toBe(fallbackUrl);
  });
});
