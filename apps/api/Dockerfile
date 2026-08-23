ARG AUDIVERIS_VERSION=5.10.2

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build -w apps/api

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Keep the OMR runtime in the image so API and worker behave identically in
# production. Audiveris publishes a self-contained Ubuntu installer (including
# its JRE); the remaining packages provide PDF rendering, OCR languages and
# native libraries needed by Java/AWT in batch mode.
ARG AUDIVERIS_VERSION=5.10.2
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-dejavu \
    libasound2 \
    libfreetype6 \
    libgtk-3-0 \
    libxext6 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-por \
  && curl -fsSL "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu22.04-x86_64.deb" -o /tmp/audiveris.deb \
  && apt-get install -y --no-install-recommends /tmp/audiveris.deb \
  && rm -f /tmp/audiveris.deb \
  && rm -rf /var/lib/apt/lists/*
ENV AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris \
    JAVA_TOOL_OPTIONS=-Djava.awt.headless=true
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY apps/api/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p storage/uploads storage/exports
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]
