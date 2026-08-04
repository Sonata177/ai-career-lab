FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/index.js .

FROM nginx:alpine AS production
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
