FROM node:22-alpine
WORKDIR /app
# Official signing/transport implementation; no installation hooks.
RUN npm install --ignore-scripts --no-audit --no-fund --save-exact @fly-ai/flyai-cli@1.0.16
COPY server.mjs ./
USER node
CMD ["node", "server.mjs"]
