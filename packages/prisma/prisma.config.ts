import * as dotenv from "dotenv";
import * as path from "node:path";
import type { PrismaConfig } from "prisma";

// resolve relative to the root dir of the mono repo; prevents having to have a symlink to .env
const rootDir = path.resolve(__dirname, "../../");

dotenv.config({
  path: path.join(rootDir, ".env"),
});

export default {
  migrations: {
    seed: `ts-node --transpile-only "${path.join(rootDir, "scripts/seed.ts")}"`,
  },
} satisfies PrismaConfig;
