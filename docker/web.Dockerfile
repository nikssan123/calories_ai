# ---- build ----------------------------------------------------------------
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json             apps/web/
COPY packages/shared/package.json      packages/shared/
COPY packages/api-client/package.json  packages/api-client/
RUN pnpm install --frozen-lockfile --filter @ct/web...

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @ct/web build

# ---- runtime --------------------------------------------------------------
# Only the standalone server, its traced dependencies and the static assets.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `standalone` mirrors the workspace layout, so the server entrypoint sits at
# the app's path inside the traced tree rather than at the root.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
