import type { OpenAPIObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { AUTHORIZATION_SECURITY_SCHEME, applyAuthorizationSecurity } from "./generate-swagger";

function buildDocument(paths: OpenAPIObject["paths"]): OpenAPIObject {
  return {
    openapi: "3.0.0",
    info: { title: "test", version: "1.0.0" },
    paths,
  } as unknown as OpenAPIObject;
}

describe("applyAuthorizationSecurity", () => {
  it("replaces the ignored Authorization header with a bearer security requirement", () => {
    const document = buildDocument({
      "/v2/bookings": {
        get: {
          tags: ["Bookings"],
          parameters: [
            { name: "Authorization", in: "header", required: true, schema: { type: "string" } },
            { name: "cal-api-version", in: "header", required: true, schema: { type: "string" } },
          ],
          responses: {},
        },
      },
    } as unknown as OpenAPIObject["paths"]);

    applyAuthorizationSecurity(document);

    const operation = document.paths["/v2/bookings"].get;
    // The Authorization header parameter (which Swagger UI ignores) is removed...
    expect(operation?.parameters).toEqual([
      { name: "cal-api-version", in: "header", required: true, schema: { type: "string" } },
    ]);
    // ...and the bearer security requirement is added so the header is actually sent.
    expect(operation?.security).toEqual([{ [AUTHORIZATION_SECURITY_SCHEME]: [] }]);
  });

  it("leaves public operations (no Authorization header) untouched", () => {
    const document = buildDocument({
      "/v2/slots": {
        get: {
          tags: ["Slots"],
          parameters: [{ name: "cal-api-version", in: "header", schema: { type: "string" } }],
          responses: {},
        },
      },
      "/v2/health": {
        get: { tags: ["Health"], responses: {} },
      },
    } as unknown as OpenAPIObject["paths"]);

    applyAuthorizationSecurity(document);

    const slots = document.paths["/v2/slots"].get;
    expect(slots?.parameters).toHaveLength(1);
    expect(slots?.security).toBeUndefined();

    const health = document.paths["/v2/health"].get;
    expect(health?.security).toBeUndefined();
  });

  it("appends to any pre-existing operation security instead of overwriting it", () => {
    const document = buildDocument({
      "/v2/me": {
        get: {
          tags: ["Me"],
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: "Authorization", in: "header", schema: { type: "string" } }],
          responses: {},
        },
      },
    } as unknown as OpenAPIObject["paths"]);

    applyAuthorizationSecurity(document);

    expect(document.paths["/v2/me"].get?.security).toEqual([
      { ApiKeyAuth: [] },
      { [AUTHORIZATION_SECURITY_SCHEME]: [] },
    ]);
  });

  it("handles an Authorization header declared at the path level (inherited by all operations)", () => {
    const document = buildDocument({
      "/v2/orgs/{orgId}": {
        parameters: [{ name: "Authorization", in: "header", schema: { type: "string" } }],
        get: { tags: ["Orgs"], responses: {} },
        post: {
          tags: ["Orgs"],
          parameters: [{ name: "cal-api-version", in: "header", schema: { type: "string" } }],
          responses: {},
        },
      },
    } as unknown as OpenAPIObject["paths"]);

    applyAuthorizationSecurity(document);

    const pathItem = document.paths["/v2/orgs/{orgId}"];
    // The inherited path-level Authorization header is removed...
    expect(pathItem.parameters).toEqual([]);
    // ...and every operation in the path gets the bearer security requirement.
    expect(pathItem.get?.security).toEqual([{ [AUTHORIZATION_SECURITY_SCHEME]: [] }]);
    expect(pathItem.post?.security).toEqual([{ [AUTHORIZATION_SECURITY_SCHEME]: [] }]);
    // Unrelated operation-level parameters are preserved.
    expect(pathItem.post?.parameters).toEqual([
      { name: "cal-api-version", in: "header", schema: { type: "string" } },
    ]);
  });

  it("ignores reference ($ref) parameters without throwing", () => {
    const document = buildDocument({
      "/v2/ref": {
        get: {
          tags: ["Ref"],
          parameters: [{ $ref: "#/components/parameters/SomeParam" }],
          responses: {},
        },
      },
    } as unknown as OpenAPIObject["paths"]);

    expect(() => applyAuthorizationSecurity(document)).not.toThrow();
    expect(document.paths["/v2/ref"].get?.security).toBeUndefined();
    expect(document.paths["/v2/ref"].get?.parameters).toHaveLength(1);
  });

  it("returns the document unchanged when there are no paths", () => {
    const document = { openapi: "3.0.0", info: { title: "t", version: "1" } } as unknown as OpenAPIObject;
    expect(() => applyAuthorizationSecurity(document)).not.toThrow();
  });
});
