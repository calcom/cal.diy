import { PerformanceObserver } from "node:perf_hooks";
import process from "node:process";
import logger from "../logger";

declare global {
  // eslint-disable-next-line no-var
  var perfObserver: PerformanceObserver | undefined;
}
export const perfObserver =
  globalThis.perfObserver ||
  new PerformanceObserver((items) => {
    items.getEntries().forEach((entry) => {
      // Log entry duration in seconds with four decimal places.
      logger.debug(entry.name.replace("$1", `${(entry.duration / 1000.0).toFixed(4)}s`));
    });
  });

perfObserver.observe({ entryTypes: ["measure"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.perfObserver = perfObserver;
}

export default perfObserver;

export { performance } from "node:perf_hooks";
