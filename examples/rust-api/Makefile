.PHONY: all build run clean test help

# Binary name (cargo emits target/<profile>/rust-api)
BINARY=rust-api

# Default port
PORT?=8080

all: build

## build: Build the release binary
build:
	@echo "Building $(BINARY)..."
	cargo build --release
	@echo "Binary built: target/release/$(BINARY)"

## run: Run the server (debug build)
run:
	@echo "Starting server on port $(PORT)..."
	PORT=$(PORT) cargo run

## clean: Remove build artifacts
clean:
	@echo "Cleaning..."
	cargo clean
	@echo "Cleaned"

## test: Build-check the crate
test:
	cargo build

## help: Show this help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed 's/^/  /'
