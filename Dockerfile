# syntax=docker/dockerfile:1
#
# Build do app React Router 7 com Bun.
# - O projeto usa `bun.lock`, então não há `package-lock.json` (era o que quebrava
#   o Dockerfile padrão gerado pelo `create-react-router`).
# - `--ignore-scripts` no install evita rodar o `prepare` (lefthook), que é
#   ferramenta de dev e quebra se .git não existir no contexto.

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
EXPOSE 3000
CMD ["bun", "run", "start"]
