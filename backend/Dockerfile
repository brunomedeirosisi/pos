FROM node:20.18.3-alpine3.20 AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci

FROM node:20.18.3-alpine3.20 AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY openapi ./openapi
COPY sql ./sql
RUN npm run build
RUN npm prune --omit=dev

FROM node:20.18.3-alpine3.20 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S pos && adduser -S pos -G pos
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/sql ./sql
USER pos
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/v1/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
