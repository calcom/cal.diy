import type { Prisma } from "@calcom/prisma/client";

function isPrismaObj(obj: unknown): obj is Prisma.JsonObject {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj);
}

export function isPrismaObjOrUndefined(obj: unknown) {
  return isPrismaObj(obj) ? obj : undefined;
}

export default isPrismaObj;
