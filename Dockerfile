# Use official Bun image for building
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies (cached)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Set production environment
ENV NODE_ENV=production

# Compile the API to a standalone binary
# We use --minify-whitespace and --minify-syntax to keep it small 
# without breaking instrumentation.
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile server \
    src/index.ts

# Compile the Worker to a standalone binary
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile worker-bin \
    src/workers.ts

# Runtime stage
# We use oven/bun:slim instead of distroless to keep the 'bun' runtime 
# available for running migrations (db:push) and seeding (db:seed)
FROM oven/bun:1-slim AS release
WORKDIR /app

# Copy the compiled binaries
COPY --from=build /app/server .
COPY --from=build /app/worker-bin .

# Copy files needed for migrations and seeding
# (These need the 'bun' runtime, which is why we use bun:slim)
COPY --from=build /app/src/drizzle ./src/drizzle
COPY --from=build /app/seed_data ./seed_data
COPY --from=build /app/drizzle.config.ts .
COPY --from=build /app/package.json .
COPY --from=build /app/node_modules ./node_modules

# Set environment to production
ENV NODE_ENV=production

# Expose the API port
EXPOSE 3000

# Default command for the API
CMD ["./server"]
