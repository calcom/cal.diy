import { nanoid } from "nanoid";
import logger from "../logger";
import { DistributedTracing, type IdGenerator } from "./index";

const idGenerator: IdGenerator = {
  generate: () => nanoid(),
};

export function createDistributedTracing(): DistributedTracing {
  return new DistributedTracing(idGenerator, logger);
}

export const distributedTracing = createDistributedTracing();
