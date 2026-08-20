# The API runs the Claude Agent SDK, which spawns a bundled native `claude`
# binary. That binary is glibc-linked, so this must be a glibc base — on Alpine
# it fails to launch with a misleading "binary exists but failed to launch".
FROM node:22-slim

RUN corepack enable

# git is not used at runtime, but the Agent SDK shells out to it in some code
# paths; ca-certificates is needed for TLS to api.anthropic.com.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so a source-only change reuses the dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json      apps/api/
COPY packages/shared/package.json      packages/shared/
COPY packages/api-client/package.json  packages/api-client/

# --frozen-lockfile so a drifted lockfile fails the build instead of silently
# resolving different versions than were tested.
RUN pnpm install --frozen-lockfile --filter @ct/api... --prod=false

# The Agent SDK ships a complete Claude Code binary but does not link it onto
# PATH, so `claude` is unavailable for the one-time `claude auth login` that
# writes the subscription credentials. Symlink the copy that is already here
# rather than installing a second one — the CLI package is ~100MB.
#
# The path is version- and arch-specific, so resolve it at build time; the
# --version call makes the build fail loudly if the layout ever changes rather
# than shipping a dangling symlink that only bites at login time.
RUN ln -sf "$(find /app/node_modules/.pnpm -type f -name claude -path '*claude-agent-sdk-*' | head -1)" \
        /usr/local/bin/claude \
 && claude --version

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

# The agent needs a writable HOME for its credentials, and its own empty working
# directory — pointing its cwd at the uploads folder was a bug once already, and
# a missing cwd fails the spawn outright.
ENV HOME=/home/node
RUN mkdir -p /home/node /app/apps/api/uploads /app/apps/api/.agent-workspace \
 && chown -R node:node /home/node /app/apps/api/uploads /app/apps/api/.agent-workspace

USER node
WORKDIR /app/apps/api

EXPOSE 4000
# Migrations run on boot: the schema and the code that expects it ship together,
# so there is no window where a new image is serving against an old schema.
#
# The recipe library is seeded on the same breath, for the same reason. It is
# reference data, not somebody's rows — the exercise catalogue gets this for
# free by being an INSERT inside its migration, but a hundred recipes with
# nutrition and photographs live in a JSON file that plain SQL cannot read. So
# it runs here instead. The seed is an upsert keyed on the USDA slug: harmless
# on every restart, and the way a correction to the data reaches production.
#
# Chained with && so a broken seed stops the boot and shows up in the deploy's
# verification, rather than leaving the Cook tab quietly empty — which is
# exactly the failure this replaces.
CMD ["sh", "-c", "pnpm exec tsx src/migrate.ts && pnpm exec tsx src/seed-library.ts && pnpm exec tsx src/index.ts"]
