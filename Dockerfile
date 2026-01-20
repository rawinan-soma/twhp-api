FROM oven/bun:1.3.3

RUN apt-get update -y && apt-get install -y openssl ca-certificates && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install

COPY . .

EXPOSE 8888
