import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  PathsObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { getEnv } from "@/env";
import "dotenv/config";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import type { Server } from "node:http";
import { createRequire } from "node:module";

const nodeRequire = createRequire(__filename);
const biomeBin = nodeRequire.resolve("@biomejs/biome/bin/biome");

const HttpMethods: (keyof PathItemObject)[] = ["get", "post", "put", "delete", "patch", "options", "head"];

// Name of the bearer security scheme used for the `Authorization` header.
export const AUTHORIZATION_SECURITY_SCHEME = "Authorization";

export async function generateSwaggerForApp(app: NestExpressApplication<Server>) {
  const logger = new Logger("App");
  logger.log(`Generating Swagger documentation...\n`);

  const config = new DocumentBuilder()
    .setTitle("Cal.diy API v2")
    // Endpoints declare auth via `@ApiHeader({ name: "Authorization" })`, but the
    // OpenAPI spec mandates that a header parameter named "Authorization" be
    // ignored, so Swagger UI never sends it. Register a proper bearer security
    // scheme instead (see applyAuthorizationSecurity for where it gets applied).
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        in: "header",
        name: "Authorization",
        description: "Enter your API key or access token (sent as `Authorization: Bearer <token>`).",
      },
      AUTHORIZATION_SECURITY_SCHEME
    )
    .build();
  const document = applyAuthorizationSecurity(SwaggerModule.createDocument(app, config));
  document.paths = groupAndSortPathsByFirstTag(document.paths);

  const docsOutputFile = "../../../docs/api-reference/v2/openapi.json";
  const stringifiedContents = JSON.stringify(document, null, 2);

  if (fs.existsSync(docsOutputFile) && getEnv("NODE_ENV") === "development") {
    fs.unlinkSync(docsOutputFile);
    fs.writeFileSync(docsOutputFile, stringifiedContents, { encoding: "utf8" });
    spawnSync("node", [biomeBin, "format", "--write", docsOutputFile], { stdio: "inherit" });
  }

  if (!process.env.DOCS_URL) {
    SwaggerModule.setup("docs", app, document, {
      customCss: ".swagger-ui .topbar { display: none }",
    });

    logger.log(`Swagger documentation available in the "/docs" endpoint\n`);
  }
}

function isAuthorizationHeaderParam(param: ParameterObject | { $ref: string }): boolean {
  return "in" in param && param.in === "header" && param.name === "Authorization";
}

/**
 * Swagger UI silently drops a header parameter named "Authorization" because the
 * OpenAPI spec requires it to be ignored. For every operation that declared such
 * a parameter (via `@ApiHeader({ name: "Authorization" })`), replace it with the
 * bearer security requirement so the "Authorize" button actually attaches the
 * `Authorization` header to outgoing requests. Operations without that header
 * (i.e. genuinely public endpoints) are left untouched.
 *
 * Parameters can also be declared at the path level, where they are inherited by
 * every operation in the path, so those are handled as well.
 */
export function applyAuthorizationSecurity(document: OpenAPIObject): OpenAPIObject {
  if (!document.paths) {
    return document;
  }

  Object.keys(document.paths).forEach((pathKey) => {
    const pathItem = document.paths[pathKey];

    const pathHasAuthHeader = Array.isArray(pathItem.parameters)
      ? pathItem.parameters.some(isAuthorizationHeaderParam)
      : false;

    HttpMethods.forEach((method) => {
      const operation = pathItem[method];

      if (!isOperationObject(operation)) {
        return;
      }

      const operationHasAuthHeader = operation.parameters?.some(isAuthorizationHeaderParam) ?? false;

      // Nothing to do for operations that neither declare nor inherit the header.
      if (!operationHasAuthHeader && !pathHasAuthHeader) {
        return;
      }

      // Drop the operation-level parameter Swagger UI ignores...
      if (operationHasAuthHeader && operation.parameters) {
        operation.parameters = operation.parameters.filter((param) => !isAuthorizationHeaderParam(param));
      }
      // ...and require the bearer scheme instead so the header is actually sent.
      operation.security = [...(operation.security ?? []), { [AUTHORIZATION_SECURITY_SCHEME]: [] }];
    });

    // Drop the inherited path-level Authorization header, now represented as a
    // security requirement on each operation above.
    if (pathHasAuthHeader && Array.isArray(pathItem.parameters)) {
      pathItem.parameters = pathItem.parameters.filter((param) => !isAuthorizationHeaderParam(param));
    }
  });

  return document;
}

function groupAndSortPathsByFirstTag(paths: PathsObject): PathsObject {
  const groupedPaths: { [key: string]: PathsObject } = {};

  Object.keys(paths).forEach((pathKey) => {
    const pathItem = paths[pathKey];

    HttpMethods.forEach((method) => {
      const operation = pathItem[method];

      if (isOperationObject(operation) && operation.tags && operation.tags.length > 0) {
        const firstTag = operation.tags[0];

        if (!groupedPaths[firstTag]) {
          groupedPaths[firstTag] = {};
        }

        groupedPaths[firstTag][pathKey] = pathItem;
      }
    });
  });

  const sortedTags = Object.keys(groupedPaths).sort(customTagSort);
  const sortedPaths: PathsObject = {};

  sortedTags.forEach((tag) => {
    Object.assign(sortedPaths, groupedPaths[tag]);
  });

  return sortedPaths;
}

function customTagSort(a: string, b: string): number {
  const platformPrefix = "Platform";
  const orgsPrefix = "Orgs";

  if (a.startsWith(platformPrefix) && !b.startsWith(platformPrefix)) {
    return -1;
  }
  if (!a.startsWith(platformPrefix) && b.startsWith(platformPrefix)) {
    return 1;
  }

  if (a.startsWith(orgsPrefix) && !b.startsWith(orgsPrefix)) {
    return -1;
  }
  if (!a.startsWith(orgsPrefix) && b.startsWith(orgsPrefix)) {
    return 1;
  }

  return a.localeCompare(b);
}

function isOperationObject(obj: any): obj is OperationObject {
  return obj && typeof obj === "object" && "tags" in obj;
}
