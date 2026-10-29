FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS archive-tools
COPY scripts/install-sevenzip.mjs /tmp/install-sevenzip.mjs
RUN apk add --no-cache xz && node /tmp/install-sevenzip.mjs

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund
RUN npm ci

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
RUN npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY openapi ./openapi
COPY sql ./sql
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache postgresql16-client=16.15-r0 \
    && addgroup -S -g 10001 pos && adduser -S -u 10001 pos -G pos \
    && install -d -o pos -g pos -m 0700 /var/backups/pos /var/backups/replica /var/backups/readonly
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/sql ./sql
COPY --from=archive-tools /usr/local/bin/7zz /usr/local/bin/7zz
COPY --from=archive-tools /usr/local/share/licenses/7zip /usr/local/share/licenses/7zip
USER pos
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/v1/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
