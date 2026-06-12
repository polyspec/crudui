# Build stage
FROM rust:1-slim AS builder

WORKDIR /app

# Copy the validator crate first (path dependency).
COPY packages/validator-rust /app/packages/validator-rust

# Copy the rust-api crate.
COPY examples/rust-api /app/examples/rust-api

# Build the release binary. The path dependency resolves to
# ../../packages/validator-rust, preserved by the layout above.
WORKDIR /app/examples/rust-api
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Copy the binary from the builder.
COPY --from=builder /app/examples/rust-api/target/release/rust-api /app/rust-api

# Create specs directory (mounted at runtime).
RUN mkdir -p /app/specs

# Expose port.
EXPOSE 8080

# Environment.
ENV PORT=8080
ENV SPECS_DIR=/app/specs

# Run the server.
CMD ["/app/rust-api"]
