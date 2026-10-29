import { describe, expect, it } from "vitest";
import { ZAddSecondaryEmailInputSchema } from "../../loggedInViewer/addSecondaryEmail.schema";
import { ZUpdateProfileInputSchema } from "./updateProfile.schema";

describe("email normalization", () => {
  it("lowercases the primary email on profile update", () => {
    const result = ZUpdateProfileInputSchema.parse({ email: "John.Doe@Example.COM" });
    expect(result.email).toBe("john.doe@example.com");
  });

  it("leaves email undefined when not provided", () => {
    const result = ZUpdateProfileInputSchema.parse({ name: "John" });
    expect(result.email).toBeUndefined();
  });

  it("lowercases a newly added secondary email", () => {
    const result = ZAddSecondaryEmailInputSchema.parse({ email: "John.Doe@Example.COM" });
    expect(result.email).toBe("john.doe@example.com");
  });
});
