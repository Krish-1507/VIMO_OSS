FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm install

COPY packages/backend ./packages/backend

RUN npm run build --workspace=packages/backend

FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "packages/backend/dist/backend/src/index.js"]
