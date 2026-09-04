import { describe, expect, it } from "vitest";

import { slugify } from "./slugify";

describe("slugify", () => {
  it("should convert to lowercase", () => {
    expect(slugify("Hello")).toEqual("hello");
    expect(slugify("HELLO")).toEqual("hello");
  });

  it("should convert spaces, _, +, # and any other special character to -", () => {
    expect(slugify("hello there")).toEqual("hello-there");
    expect(slugify("hello_there")).toEqual("hello-there");
    expect(slugify("hello$there")).toEqual("hello-there");
    expect(slugify("hello+there")).toEqual("hello-there");
    expect(slugify("#hellothere")).toEqual("hellothere");
  });

  it("should keep numbers as is", () => {
    expect(slugify("hellothere123")).toEqual("hellothere123");
    expect(slugify("321hello there123")).toEqual("321hello-there123");
    expect(slugify("hello$there")).toEqual("hello-there");
  });

  // So that user can freely add spaces and any other character iteratively and it gets converted to - later on.
  it("should remove dashes from start and end.", () => {
    expect(slugify("hello-there-")).toEqual("hello-there");
    expect(slugify("hello-there_")).toEqual("hello-there");
    expect(slugify("_hello-there_")).toEqual("hello-there");
    expect(slugify("$hello-there_")).toEqual("hello-there");
  });

  it("should keep periods as is except the start and end", () => {
    expect(slugify("hello.there")).toEqual("hello.there");
    expect(slugify("h.e.l.l.o.t.h.e.r.e")).toEqual("h.e.l.l.o.t.h.e.r.e");
  });
  it("should remove consecutive periods", () => {
    expect(slugify("hello...there")).toEqual("hello.there");
    expect(slugify("hello....there")).toEqual("hello.there");
    expect(slugify("hello..there")).toEqual("hello.there");
  });
  it("should remove periods from start and end", () => {
    expect(slugify(".hello.there")).toEqual("hello.there");
    expect(slugify(".hello.there.")).toEqual("hello.there");
    expect(slugify("hellothere.")).toEqual("hellothere");
  });

  it("Should replace consecutive dashes with a single dash", () => {
    expect(slugify("Hello -  World 123_ !@#  Test    456   789")).toEqual("hello-world-123-test-456-789");
  });

  // This is failing, if we want to fix it, one approach is as used in getValidRhfFieldName
  it("should remove emoji characters", () => {
    expect(slugify("Hello 📚🕯️ There")).toEqual("hello-there");
    expect(slugify("📚🕯️")).toEqual("");
  });

  it("should remove unicode", () => {
    expect(slugify("Hello ®️ There")).toEqual("hello-there");
    expect(slugify("®️")).toEqual("");
  });

  it("should keep letters from non-latin scripts", () => {
    expect(slugify("北京会议")).toEqual("北京会议");
    expect(slugify("Встреча")).toEqual("встреча");
    expect(slugify("اجتماع")).toEqual("اجتماع");
  });
});
