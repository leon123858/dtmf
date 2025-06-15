# ---- Stage 1: Builder ----
FROM node:22-alpine AS builder

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 lock 檔案
COPY package*.json ./

# 安裝所有依賴 (包含 devDependencies，因為 build 需要)
RUN npm install

# 複製所有專案原始碼
COPY . .

# 停用 Next.js 的匿名遙測回報
ENV NEXT_TELEMETRY_DISABLED=1
# Backend URL
ENV NEXT_PUBLIC_API_HTTP_URL='https://powerbunny.xyz'
ENV NEXT_PUBLIC_API_WS_URL='wss://powerbunny.xyz'

# 執行建置命令
RUN npm run build

# ---- Stage 2: Runner ----
# 使用相同的輕量基礎映像檔
FROM node:22-alpine AS runner

WORKDIR /app

# 設定環境為 production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 為了安全，建立一個非 root 的使用者和群組
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 從 builder 階段複製 public 資料夾
COPY --from=builder /app/public ./public

# 從 builder 階段複製 standalone 的輸出
# --chown=nextjs:nodejs 是一個安全措施，將複製過來的檔案擁有者設為我們剛建立的非 root 使用者
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 從 builder 階段複製靜態資源
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切換到非 root 使用者
USER nextjs

# 開放 Next.js 預設的 3000 port
EXPOSE 3000

# 設定環境變數，讓 Next.js 知道在哪個 port 啟動
ENV PORT=3000

# 容器啟動時執行的命令
# standalone 模式會產生一個 server.js 檔案來啟動服務
CMD ["node", "server.js"]