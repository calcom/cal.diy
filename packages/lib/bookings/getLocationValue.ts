import logger from "@calcom/lib/logger";

export const getLocationValue = (
  location: string | undefined,
  responseLocation: string | { value: unknown } | undefined
): string | undefined => {
  if (location) return location;

  if (typeof responseLocation === "string") return responseLocation;

  if (
    responseLocation &&
    typeof responseLocation === "object" &&
    "value" in responseLocation &&
    typeof responseLocation.value === "string"
  ) {
    return responseLocation.value;
  }

  // Only warn when a value was actually provided but its type is unrecognized — an absent location is expected and not worth logging.
  if (responseLocation !== undefined) {
    logger.warn(
      `getLocationValue - location ${location} and response location ${JSON.stringify(
        responseLocation
      )} were passed but the type is not supported.`
    );
  }

  return undefined;
};
