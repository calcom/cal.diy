import { getEnv } from "@/env";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import type {
  PathItemObject,
  PathsObject,
  OperationObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import "dotenv/config";
import * as fs from "node:fs";
import type { Server } from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const nodeRequire = createRequire(__filename);
const biomeBin = nodeRequire.resolve("@biomejs/biome/bin/biome");

const HttpMethods: (keyof PathItemObject)[] = ["get", "post", "put", "delete", "patch", "options", "head"];

export async function generateSwaggerForApp(app: NestExpressApplication<Server>) {
  const logger = new Logger("App");
  logger.log(`Generating Swagger documentation...\n`);

  const config = new DocumentBuilder().setTitle("Cal.diy API v2").build();
  const document = SwaggerModule.createDocument(app, config);
  document.paths = groupAndSortPathsByFirstTag(document.paths);
  dedupeOperationIds(document.paths);

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

// A handler registered on several paths, e.g. @Get(["/events/:id", "/event/:id"]), gets the same
// operationId for every path, and operationIdFactory isn't given the path to tell them apart.
export function dedupeOperationIds(paths: PathsObject): void {
  const seenCounts: Record<string, number> = {};

  Object.values(paths).forEach((pathItem) => {
    HttpMethods.forEach((method) => {
      const operation = pathItem[method];

      if (!isOperationObject(operation) || !operation.operationId) return;

      const count = (seenCounts[operation.operationId] ?? 0) + 1;
      seenCounts[operation.operationId] = count;

      if (count > 1) {
        operation.operationId = `${operation.operationId}_${count}`;
      }
    });
  });
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
