# Form Generator Examples

This directory contains example applications demonstrating the form-generator system with multiple backend implementations.

## Quick Start

Run all services with Docker Compose:

```bash
cd examples
docker-compose up --build
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Demo App | 8010 | React application showcasing form generation |
| Node API | 8011 | Node.js/Express validation server |
| PHP API | 8012 | PHP validation server with Apache |
| Go API | 8013 | Go validation server |
| Playground | 8014 | Interactive form spec editor |

## URLs

Once the services are running, access them at:

- **Demo App**: [http://localhost:8010](http://localhost:8010)
- **Node API**: [http://localhost:8011](http://localhost:8011)
- **PHP API**: [http://localhost:8012](http://localhost:8012)
- **Go API**: [http://localhost:8013](http://localhost:8013)
- **Playground**: [http://localhost:8014](http://localhost:8014)

## Individual Service Commands

### Build all services
```bash
docker-compose build
```

### Start all services in detached mode
```bash
docker-compose up -d
```

### View logs
```bash
docker-compose logs -f
```

### View logs for a specific service
```bash
docker-compose logs -f demo-app
docker-compose logs -f node-api
docker-compose logs -f php-api
docker-compose logs -f go-api
docker-compose logs -f playground
```

### Stop all services
```bash
docker-compose down
```

### Rebuild a specific service
```bash
docker-compose up --build demo-app
```

## Network

All services are connected via the `form-generator-network` bridge network, allowing inter-service communication using service names as hostnames.

## Health Checks

Each service includes a health check configuration:

- **Demo App**: HTTP check on port 80
- **Node API**: HTTP check on port 3000
- **PHP API**: curl check on port 80 (via Apache)
- **Go API**: wget check on port 8080
- **Playground**: HTTP check on port 80

Check service health status:
```bash
docker-compose ps
```

## Labels

Services are labeled for easy identification:
- `com.form-generator.service`: Service name
- `com.form-generator.description`: Service description

List services by label:
```bash
docker ps --filter "label=com.form-generator.service"
```
