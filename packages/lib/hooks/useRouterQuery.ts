import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";

/**
 * An alternative to Object.fromEntries that allows duplicate keys.
 * There is a duplicate of the function in @calcom/embeds/embed-core/src/utils.ts. Keep them in sync.
 */
function fromEntriesWithDuplicateKeys(entries: IterableIterator<[string, string]> | null) {
  const result: Record<string, string | string[]> = {};

  if (entries === null) {
    return result;
  }

  // Consider setting atleast ES2015 as target
  // @ts-expect-error
  for (const [key, value] of entries) {
    if (Object.hasOwn(result, key)) {
      let currentValue = result[key];
      if (!Array.isArray(currentValue)) {
        currentValue = [currentValue];
      }
      currentValue.push(value);
      result[key] = currentValue;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * This hook returns the query object from the router. It is an attempt to
 * keep the original query object from the old useRouter hook.
 * At least until everything is properly migrated to the new router.
 * @returns {Object} routerQuery
 */
export const useRouterQuery = () => {
  const searchParams = useCompatSearchParams();
  const routerQuery = fromEntriesWithDuplicateKeys(searchParams?.entries() ?? null);
  return routerQuery;
};
