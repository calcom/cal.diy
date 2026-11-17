import fs from "node:fs";
import process from "node:process";
import logger from "./logger";

/** This should be used if we want to ensure a log statement is always executed.
 *
 * This should only be used server side
 */
export const criticalLogger = logger.getSubLogger({
  name: "critical",
  overwrite: {
    transportJSON: (logObj) => {
      const logString = JSON.stringify(logObj);
      const buffer = Buffer.from(logString + "\n");

      try {
        fs.writeSync(process.stdout.fd, buffer);
      } catch (error) {
        console.log(`Critical logger: Failed to write log using fs.writeSync: ${error}`);
        console.log(logString);
      }
    },
  },
});
