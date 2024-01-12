FROM node:lts-alpine AS build

WORKDIR /app

COPY dist/ng-realtime .

COPY package.json package-lock.json ./

RUN npm install --omit=dev --loglevel verbose

FROM nginx

WORKDIR /usr/share/nginx/html

RUN rm -rf ./*

COPY ./nginx.conf /etc/nginx/nginx.conf

COPY --from=build /app .

EXPOSE 4300

ENTRYPOINT ["nginx", "-g", "daemon off;"]
