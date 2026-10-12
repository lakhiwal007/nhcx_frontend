# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_BASE_URL=/nhcx/api/v1/insurance
ARG VITE_USE_MOCK=false

ENV VITE_BASE_URL=${VITE_BASE_URL}
ENV VITE_USE_MOCK=${VITE_USE_MOCK}

RUN npm run build


# Production stage - no Nginx
FROM node:20-alpine

WORKDIR /app

RUN npm install --global serve

COPY --from=builder /app/dist ./dist

# Serve the build files at the expected URL path
RUN mkdir -p ./dist/nhcx/service \
    && cp -r ./dist/assets ./dist/nhcx/service/ \
    && cp ./dist/favicon.svg ./dist/nhcx/service/ \
    && cp ./dist/icons.svg ./dist/nhcx/service/ \
    && cp ./dist/index.html ./dist/nhcx/service/index.html

EXPOSE 80

CMD ["serve", "-s", "dist", "-l", "80"]