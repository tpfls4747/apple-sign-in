# 크롬(Playwright) + ffmpeg + 한글 폰트가 들어 있는 이미지 - 서버에서 영상을 렌더하기 위해 필요해요
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY supabase ./supabase

ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node", "server/index.js"]
