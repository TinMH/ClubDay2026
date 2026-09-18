FROM node:22-bookworm-slim

WORKDIR /app

# ── 1. Dependency ──
# Copy manifest TRƯỚC source: layer `npm ci` chỉ mất hiệu lực khi dependency đổi,
# sửa code app thì không phải cài lại từ đầu.
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/server/package*.json ./apps/server/
RUN npm ci

# ── 2. Model ONNX (~20MB) ──
# Tải NGAY TRONG IMAGE, ở một layer RIÊNG, và phải đứng TRƯỚC `COPY . .`.
#
# Vì sao không copy từ ./models của máy build: thư mục đó nằm trong .gitignore,
# nên build từ một bản `git clone` sạch sẽ không có model. Cộng với MODEL_OFFLINE=1
# ở docker-compose là model lỗi lúc khởi động — container vẫn lên, /api/health báo
# `model: error`, và mọi frame vẽ trả 503. Lỗi chỉ lộ ra khi có người thật đang vẽ.
#
# KHÔNG TẢI LẠI mỗi lần build: layer này chỉ phụ thuộc 4 file dưới đây, mà chúng
# gần như không bao giờ đổi. Sửa code game, sửa UI, thêm route — Docker đều dùng
# lại layer đã cache, không chạm mạng. Chỉ khi đổi MODEL_ID/MODEL_DTYPE trong
# apps/server/src/model.ts thì mới tải lại, và lúc đó tải lại là ĐÚNG.
#
# Bản thân script cũng tự bỏ qua nếu cache đã đủ file (0,8s so với 21,8s lần đầu),
# nên kể cả layer bị mất hiệu lực vì lý do khác thì cũng không tải lại từ số 0.
COPY tsconfig.base.json ./
COPY scripts/tsconfig.json ./scripts/
COPY scripts/prefetch-model.ts ./scripts/
COPY apps/server/src/model.ts ./apps/server/src/
RUN npm run prefetch

# ── 3. Source + build ──
# `models/` và `data/` bị .dockerignore loại ra, nên bước này KHÔNG ghi đè model
# vừa tải ở trên, cũng không mang theo snapshot/report từ máy build vào image.
COPY . .
RUN npm run build

EXPOSE 8787

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

CMD ["npm", "start"]
