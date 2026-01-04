# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy validator module first (dependency)
COPY validator/go /app/validator

# Copy go-api module
COPY examples/go-api /app/go-api

# Update go.mod to use local validator path in container
WORKDIR /app/go-api
RUN go mod edit -replace github.com/example/form-generator/validator=../validator

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
