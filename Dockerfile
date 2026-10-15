FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm install -g pnpm@12.10.1 --registry=$NPM_REGISTRY
COPY . .
ENV LEFTHOOK=0
RUN npm pkg delete scripts.prepare && pnpm install --frozen-lockfile --registry=$NPM_REGISTRY
# Public browser keys are embedded by Next.js at build time, not read from runtime variables.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
RUN pnpm --filter copacker build
RUN cp -r apps/copacker/public apps/copacker/.next/standalone/apps/copacker/public && \
    cp -r apps/copacker/.next/static apps/copacker/.next/standalone/apps/copacker/.next/static
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/copacker/.next/standalone/apps/copacker/server.js"]
