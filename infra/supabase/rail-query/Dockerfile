FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app/upstream
RUN git init && git remote add origin https://github.com/Joooook/12306-mcp.git && git fetch --depth 1 origin ff6439da6f63d7d72181abea4568abd69878c600 && git checkout --detach FETCH_HEAD
COPY upstream-single-page.patch /tmp/upstream-single-page.patch
RUN git apply --unidiff-zero /tmp/upstream-single-page.patch
RUN npm ci --ignore-scripts --no-audit --no-fund && ./node_modules/.bin/tsc && npm prune --omit=dev --ignore-scripts --no-audit --no-fund
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/upstream/build ./upstream/build
COPY --from=build /app/upstream/package.json ./upstream/package.json
COPY --from=build /app/upstream/LICENSE ./upstream/LICENSE
COPY --from=build /app/upstream/node_modules ./upstream/node_modules
COPY server.mjs policy.mjs gate.mjs connections.mjs ./
USER node
CMD ["node", "server.mjs"]
