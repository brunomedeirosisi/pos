FROM node:20-alpine AS deps
WORKDIR /app
ENV NODE_ENV=development
# Install dependencies (includes dev deps for build)
COPY package*.json ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY openapi ./openapi
RUN npm run build
# Remove dev dependencies for the final image
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi ./openapi
EXPOSE 8080
CMD ["node", "dist/server.js"]
