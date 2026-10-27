import type { ValidationError } from "class-validator";
import { validate } from "class-validator";
import { CreateIcsFeedInputDto } from "./create-ics.input";

const validateUrls = async (urls: string[]): Promise<ValidationError[]> => {
  const input = new CreateIcsFeedInputDto();
  input.urls = urls;
  input.readOnly = true;

  return validate(input);
};

describe("CreateIcsFeedInputDto", () => {
  it("accepts standard .ics feed URLs", async () => {
    const errors = await validateUrls(["https://cal.com/ics/feed.ics"]);

    expect(errors).toHaveLength(0);
  });

  it.each(["http", "https"])("accepts valid %s feed URLs without a .ics suffix", async (protocol) => {
    const errors = await validateUrls([`${protocol}://caldav.example.com/calendars/MyCalendar?export`]);

    expect(errors).toHaveLength(0);
  });

  it("rejects malformed feed URLs", async () => {
    const errors = await validateUrls(["not-a-url"]);

    expect(errors).toEqual([expect.objectContaining({ property: "urls" })]);
  });

  it("rejects non-HTTP feed URLs", async () => {
    const errors = await validateUrls(["ftp://example.com/calendar.ics"]);

    expect(errors).toEqual([expect.objectContaining({ property: "urls" })]);
  });
});
