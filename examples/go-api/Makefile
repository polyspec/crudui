.PHONY: all build run clean test

# Binary name
BINARY=form-validator-api

# Build directory
BUILD_DIR=build

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GORUN=$(GOCMD) run
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod

# Default port
PORT?=8080

all: build

## build: Build the binary
build:
	@echo "Building $(BINARY)..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) -o $(BUILD_DIR)/$(BINARY) .
	@echo "Binary built: $(BUILD_DIR)/$(BINARY)"

## run: Run the server with go run
run:
	@echo "Starting server on port $(PORT)..."
	PORT=$(PORT) $(GORUN) main.go

## clean: Remove build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@echo "Cleaned"

## deps: Download dependencies
deps:
	@echo "Downloading dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

## test: Run tests
test:
	$(GOTEST) -v ./...

## help: Show this help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed 's/^/  /'
