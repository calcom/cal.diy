FROM --platform=$BUILDPLATFORM node:22 AS builder

WORKDIR /calcom

## If we want to read any ENV variable from .env file, we need to first accept and pass it as an argument to the Dockerfile
ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG DATABASE_URL
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ARG MAX_OLD_SPACE_SIZE=6144
ARG NEXT_PUBLIC_API_V2_URL
ARG CSP_POLICY

## We need these variables as required by Next.js build to create rewrites
ARG NEXT_PUBLIC_SINGLE_ORG_SLUG
ARG ORGANIZATIONS_ENABLED

ENV NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER \
  NEXT_PUBLIC_API_V2_URL=$NEXT_PUBLIC_API_V2_URL \
  NEXT_PUBLIC_LICENSE_CONSENT=$NEXT_PUBLIC_LICENSE_CONSENT \
  NEXT_PUBLIC_WEBSITE_TERMS_URL=$NEXT_PUBLIC_WEBSITE_TERMS_URL \
  NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=$NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL \
  CALCOM_TELEMETRY_DISABLED=$CALCOM_TELEMETRY_DISABLED \
  DATABASE_URL=$DATABASE_URL \
  DATABASE_DIRECT_URL=$DATABASE_URL \
  NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
  CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
  NEXT_PUBLIC_SINGLE_ORG_SLUG=$NEXT_PUBLIC_SINGLE_ORG_SLUG \
  ORGANIZATIONS_ENABLED=$ORGANIZATIONS_ENABLED \
  NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
  BUILD_STANDALONE=true \
  CSP_POLICY=$CSP_POLICY

COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY apps/web ./apps/web
COPY apps/api/v2 ./apps/api/v2
COPY packages ./packages

RUN yarn config set httpTimeout 1200000
RUN npx turbo prune --scope=@calcom/web --scope=@calcom/trpc --docker
RUN yarn install
# Build and make embed servable from web/public/embed folder
RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
RUN yarn --cwd apps/web workspace @calcom/web run copy-app-store-static
RUN yarn --cwd apps/web workspace @calcom/web run build
RUN rm -rf node_modules/.cache .yarn/cache apps/web/.next/cache

FROM node:22 AS builder-two

WORKDIR /calcom
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000

ENV NODE_ENV=production

COPY package.json .yarnrc.yml turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY --from=builder /calcom/yarn.lock ./yarn.lock
COPY --from=builder /calcom/node_modules ./node_modules
COPY --from=builder /calcom/packages ./packages
COPY --from=builder /calcom/apps/web ./apps/web
COPY --from=builder /calcom/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY scripts scripts
RUN chmod +x scripts/*

# Save value used during this build stage. If NEXT_PUBLIC_WEBAPP_URL and BUILT_NEXT_PUBLIC_WEBAPP_URL differ at
# run-time, then start.sh will find/replace static values again.
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL

RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}

# The runner ships Next's standalone output (BUILD_STANDALONE=true above) instead of the whole monorepo.
# Copying /calcom wholesale put ~3 GB of build-time node_modules into every image.

# Prisma CLI for `migrate deploy` at start-up and `prisma studio`. The standalone output only traces the
# runtime client, not the CLI. Installed on its own so the version follows packages/prisma/package.json.
FROM node:22-bookworm-slim AS prisma-cli
COPY packages/prisma/package.json /tmp/prisma-package.json
RUN mkdir /opt/prisma && cd /opt/prisma \
  && npm init -y > /dev/null \
  && npm install --omit=dev --no-audit --no-fund "prisma@$(node -p "require('/tmp/prisma-package.json').devDependencies?.prisma ?? require('/tmp/prisma-package.json').dependencies.prisma")" \
  && npm cache clean --force

# seed-app-store.ts needs ts-node and workspace sources at run-time. Bundle it into one file instead.
# @prisma/client stays external: its runtime loads the query compiler wasm from its own package directory,
# which the standalone output already ships.
FROM builder-two AS app-store-seed
RUN node_modules/.bin/esbuild scripts/seed-app-store.ts --bundle --platform=node --format=cjs --target=node22 \
  --external:@prisma/client --outfile=scripts/seed-app-store.js

FROM node:22-bookworm-slim AS runner

WORKDIR /calcom

# openssl: Prisma checks for it at start-up and the slim image does not include it.
RUN apt-get update && apt-get install -y --no-install-recommends netcat-openbsd wget openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder-two /calcom/apps/web/.next/standalone ./
# Next does not copy static assets and public/ into the standalone output; the server expects them next to it.
COPY --from=builder-two /calcom/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder-two /calcom/apps/web/public ./apps/web/public
COPY --from=builder-two /calcom/packages/prisma/schema.prisma ./packages/prisma/schema.prisma
COPY --from=builder-two /calcom/packages/prisma/migrations ./packages/prisma/migrations
# Default schema location, so `prisma studio` (docker-compose.yml) works without --schema.
COPY --from=builder-two /calcom/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder-two /calcom/scripts/start.sh /calcom/scripts/wait-for-it.sh /calcom/scripts/replace-placeholder.sh ./scripts/
COPY --from=app-store-seed /calcom/scripts/seed-app-store.js ./scripts/
# Kept in its own tree: its dependencies overlap the standalone node_modules at different versions.
# Link only the CLI into /calcom/node_modules so `npx prisma` resolves it instead of downloading the latest.
COPY --from=prisma-cli /opt/prisma /opt/prisma
RUN ln -s /opt/prisma/node_modules/prisma node_modules/prisma \
  && mkdir -p node_modules/.bin \
  && ln -s ../prisma/build/index.js node_modules/.bin/prisma

ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL

ENV NODE_ENV=production
# The standalone server binds to $HOSTNAME, which Docker sets to the container ID; bind all interfaces instead.
ENV HOSTNAME=0.0.0.0 \
  PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
  CMD wget --spider http://localhost:3000 || exit 1

CMD ["/calcom/scripts/start.sh"]
