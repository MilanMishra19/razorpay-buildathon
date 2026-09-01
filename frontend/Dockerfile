FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_CHECKOUT_API_URL=http://localhost:8080
ARG VITE_AGENT_API_URL=http://localhost:8000
ENV VITE_CHECKOUT_API_URL=$VITE_CHECKOUT_API_URL
ENV VITE_AGENT_API_URL=$VITE_AGENT_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
