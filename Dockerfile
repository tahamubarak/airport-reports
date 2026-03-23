FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS api-build
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=api-build /app/api/dist ./api/dist
COPY --from=api-build /app/api/node_modules ./api/node_modules
COPY --from=frontend-build /app/dist ./dist
EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080
CMD ["node", "api/dist/index.js"]
