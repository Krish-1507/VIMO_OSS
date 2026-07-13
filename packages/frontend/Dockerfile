FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/

RUN npm install

COPY packages/frontend ./packages/frontend

RUN npm run build --workspace=packages/frontend

FROM nginx:alpine

COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
