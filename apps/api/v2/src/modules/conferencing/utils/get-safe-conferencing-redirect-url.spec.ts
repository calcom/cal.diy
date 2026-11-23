import { DEFAULT_CONFERENCING_REDIRECT_URL, getSafeConferencingRedirectUrl } from "./get-safe-conferencing-redirect-url";

describe("getSafeConferencingRedirectUrl", () => {
  const WEBAPP_URL = "https://app.cal.com";

  beforeAll(() => {
    Object.assign(process.env, { NEXT_PUBLIC_WEBAPP_URL: WEBAPP_URL });
  });

  it("allows same-origin absolute URLs", () => {
    expect(getSafeConferencingRedirectUrl(`${WEBAPP_URL}/apps/installed`)).toBe(
      `${WEBAPP_URL}/apps/installed`
    );
  });

  it("allows relative paths", () => {
    expect(getSafeConferencingRedirectUrl("/apps/installed/conferencing")).toBe(
      "/apps/installed/conferencing"
    );
  });

  it("blocks external absolute URLs (CVE-2026-63768)", () => {
    expect(getSafeConferencingRedirectUrl("https://evil.com/phishing")).toBe(
      DEFAULT_CONFERENCING_REDIRECT_URL
    );
  });

  it("blocks protocol-relative URLs", () => {
    expect(getSafeConferencingRedirectUrl("//evil.com")).toBe(DEFAULT_CONFERENCING_REDIRECT_URL);
  });

  it("blocks malformed URLs", () => {
    expect(getSafeConferencingRedirectUrl("not-a-url")).toBe(DEFAULT_CONFERENCING_REDIRECT_URL);
  });

  it("falls back to the default for empty values", () => {
    expect(getSafeConferencingRedirectUrl(undefined)).toBe(DEFAULT_CONFERENCING_REDIRECT_URL);
    expect(getSafeConferencingRedirectUrl("")).toBe(DEFAULT_CONFERENCING_REDIRECT_URL);
  });
});
