"use client";

import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { usePathname } from "next/navigation";

export const useUrlMatchesCurrentUrl = (url: string, matchFullPath?: boolean) => {
  // I don't know why usePathname ReturnType doesn't include null.
  // It can certainly have null value https://nextjs.org/docs/app/api-reference/functions/use-pathname#:~:text=usePathname%20can%20return%20null%20when%20a%20fallback%20route%20is%20being%20rendered%20or%20when%20a%20pages%20directory%20page%20has%20been%20automatically%20statically%20optimized%20by%20Next.js%20and%20the%20router%20is%20not%20ready.
  const pathname = usePathname() as null | string;
  const searchParams = useCompatSearchParams();
  const query = searchParams?.toString();
  let pathnameWithQuery: string | null;
  if (query) {
    pathnameWithQuery = `${pathname}?${query}`;
  } else {
    pathnameWithQuery = pathname;
  }
  if (matchFullPath) {
    return pathnameWithQuery ? pathnameWithQuery === url : false;
  }
  // TODO: It should actually re-order the params before comparing ?a=1&b=2 should match with ?b=2&a=1
  return pathnameWithQuery ? pathnameWithQuery.includes(url) : false;
};
