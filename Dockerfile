FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm install -g pnpm@11.9.0 --registry=$NPM_REGISTRY
COPY . .
ENV LEFTHOOK=0
RUN pnpm install --frozen-lockfile --registry=$NPM_REGISTRY
RUN pnpm --filter copacker build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "copacker", "start"]
