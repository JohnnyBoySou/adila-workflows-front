# syntax=docker/dockerfile:1
#
# Build do app React Router 7 em modo SPA, servido por nginx.
# - `react-router.config.ts` está com `ssr: false`, então o build final gera
#   apenas `build/client/` (bundle Vite puro). Sem runtime Node/Bun em produção.
# - Install: Bun (rápido, lê `bun.lock`).
# - Build: Node — o Bun resolve `react-dom/server` para `server.bun.js`,
#   que não exporta `renderToPipeableStream`. Mesmo em SPA, o React Router
#   monta um bundle server transitório durante o build que importa essa API,
#   quebrando se rodar sob Bun.
# - `--ignore-scripts` no install evita rodar o `prepare` (lefthook), que é
#   ferramenta de dev e quebra sem `.git`.

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
