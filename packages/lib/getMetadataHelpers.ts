import type { SomeZodObject, z } from "zod";
import objectKeys from "./objectKeys";

/**
 * The intention behind these helpers is to make it easier to work with metadata.
 * @param schema This is the zod schema that you want to use to parse the metadata
 * @param rawMetadata This is the metadata that you want to parse
 * @returns An object with the parsed metadata, a get function to get a specific key of the metadata, and a mergeMetadata function to merge new metadata with the old one
 * @example
 * const { mergeMetadata } = getMetadataHelpers(teamMetadataSchema, team.metadata);
 * const newMetadata = mergeMetadata({ someKey: "someValue" });
 * prisma.team.update({ ..., data: { metadata: newMetadata } });
 */
export function getMetadataHelpers<T extends SomeZodObject>(schema: T, rawMetadata: unknown) {
  const metadata = schema.parse(rawMetadata) as z.infer<T>;
  return {
    metadata,
    get: (key: keyof z.infer<T>) => metadata[key],
    /** This method prevents overwriting the metadata fields that you don't want to change. */
    mergeMetadata: (newMetadata: z.infer<T>) => {
      const newMetadataToReturn = { ...metadata, ...newMetadata };
      // We check for each key of newMetadata and if it's explicitly undefined, we delete it from newMetadataToReturn
      objectKeys(newMetadata).forEach((key) => {
        if (newMetadata[key] === undefined) {
          delete newMetadataToReturn[key];
        }
      });
      return newMetadataToReturn as z.infer<T>;
    },
  };
}
