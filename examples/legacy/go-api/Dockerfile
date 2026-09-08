# Build stage
FROM golang:1.27.0-trixie AS builder

WORKDIR /app

# Copy validator module first (dependency)
COPY packages/validator-go /app/packages/validator-go

# Copy go-api module
COPY examples/legacy/go-api /app/examples/legacy/go-api

WORKDIR /app/examples/legacy/go-api

# Download dependencies
RUN go mod download

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

# Runtime stage
FROM alpine:latest

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/server /app/server

# Create specs directory
RUN mkdir -p /app/specs

# Expose port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV SPECS_DIR=/app/specs

# Run the server
CMD ["/app/server"]
