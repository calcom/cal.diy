import type { NextPageContext } from "next/types";
import superjson from "superjson";

import { httpBatchLink, httpLink, loggerLink, splitLink } from "@trpc/client";
import type { CreateTRPCNext } from "@trpc/next";
import { createTRPCNext } from "@trpc/next";
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { TRPCClientErrorLike } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "../types/server/routers/_app";
import { ENDPOINTS } from "./shared";
import { WEBAPP_URL_INTERNAL } from "@calcom/lib/constants";

type Maybe<T> = T | null | undefined;

/**
 * We deploy our tRPC router on multiple lambdas to keep number of imports as small as possible
 * TODO: Make this dynamic based on folders in trpc server?
 */
export type Endpoint = (typeof ENDPOINTS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveEndpoint = (links: any) => {
  // TODO: Update our trpc routes so they are more clear.
  // This function parses paths like the following and maps them
  // to the correct API endpoints.
  // - viewer.me - 2 segment paths like this are for logged in requests
  // - viewer.public.i18n - 3 segments paths can be public or authed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx: any) => {
    const parts = ctx.op.path.split(".");
    let endpoint: keyof typeof links;
    let path = "";
    if (parts.length == 2) {
      endpoint = parts[0] as keyof typeof links;
      path = parts[1];
    } else {
      endpoint = parts[1] as keyof typeof links;
      path = parts.splice(2, parts.length - 2).join(".");
    }
    return links[endpoint]({ ...ctx, op: { ...ctx.op, path } });
  };
};

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createTRPCReact`.
 * @link https://trpc.io/docs/v10/react#2-create-trpc-hooks
 */
export const trpc: CreateTRPCNext<AppRouter, NextPageContext, null> = createTRPCNext<
  AppRouter,
  NextPageContext
>({
  config() {
    const internalUrl = WEBAPP_URL_INTERNAL ? `${WEBAPP_URL_INTERNAL}/api/trpc` : null;
    const url =
      typeof window !== "undefined"
        ? "/api/trpc"
        : internalUrl ||
          (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}/api/trpc`
            : `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/trpc`);

    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    return {
      /**
       * @link https://trpc.io/docs/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            (typeof process.env.NEXT_PUBLIC_LOGGER_LEVEL === "number" &&
              process.env.NEXT_PUBLIC_LOGGER_LEVEL >= 0) ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        splitLink({
          // check for context property `skipBatch`
          condition: (op) => !!op.context.skipBatch,
          // when condition is true, use normal request
          true: (runtime) => {
            const links = Object.fromEntries(
              ENDPOINTS.map((endpoint) => [endpoint, httpLink({ url: `${url}/${endpoint}` })(runtime)])
            );
            return resolveEndpoint(links);
          },
          // when condition is false, use batch request
          false: (runtime) => {
            const links = Object.fromEntries(
              ENDPOINTS.map((endpoint) => [endpoint, httpBatchLink({ url: `${url}/${endpoint}` })(runtime)])
            );
            return resolveEndpoint(links);
          },
        }),
      ],
      /**
       * @link https://react-query.tanstack.com/reference/QueryClient
       */
      queryClientConfig: {
        defaultOptions: {
          queries: {
            /**
             * 1s should be enough to just keep identical query waterfalls low
             * @example if one page components uses a query that is also used further down the tree
             */
            staleTime: 1000,
            /**
             * Retry `useQuery()` calls depending on this function
             */
            retry(failureCount, _err) {
              const err = _err as never as Maybe<TRPCClientErrorLike<AppRouter>>;
              const code = err?.data?.code;
              if (code === "BAD_REQUEST" || code === "FORBIDDEN" || code === "UNAUTHORIZED") {
                // if input data is wrong or you're not authorized there's no point retrying a query
                return false;
              }
              const MAX_QUERY_RETRIES = 3;
              return failureCount < MAX_QUERY_RETRIES;
            },
          },
        },
      },
      /**
       * @link https://trpc.io/docs/data-transformers
       */
      transformer: superjson,
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   */
  ssr: false,
});

export const transformer = superjson;

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
