# LearnHarness hosted image (LH_HOSTED=1): Clerk sign-in, one data root per
# user under /data/users/<id>. See docs/hosting.md.

FROM node:26-bookworm-slim AS build
WORKDIR /app
# The desktop shell's Electron binary is a devDependency; the server never runs it.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build && node scripts/build-server.mjs

FROM node:26-bookworm-slim
# Chromium verifies agent-built demos; it runs with its own sandbox in hosted
# mode, which needs the non-root user below and deploy/chrome-seccomp.json.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir /data && chown node:node /data
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
	LH_HOSTED=1 LH_DATA_DIR=/data CHROME_PATH=/usr/bin/chromium \
	HOSTNAME=0.0.0.0 PORT=3000
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
