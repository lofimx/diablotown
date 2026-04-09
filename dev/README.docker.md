# Running HellTown with Docker

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git LFS](https://git-lfs.com/) - `brew install git-lfs` (macOS)

## Setup

**First time only - pull game assets:**
```bash
cd ..
git lfs install
git lfs pull
```

## Quick Start

From the `dev/` directory:

**First time:**
```bash
docker compose build
./docker-start.sh
```

**After that:**
```bash
./docker-start.sh
```

Rebuild when dependencies change (Gemfile, package.json, or system packages).

**Access:**
- Game: http://localhost:3000
- Map Editor: http://localhost:3000/editor

## Common Commands

### Starting services
```bash
# Start all services (detached)
docker compose up -d

# Start with logs visible
docker compose up

# Rebuild images (only when dependencies change)
docker compose build
```

### Stopping services
```bash
# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes database!)
docker compose down -v
```

### Running commands inside containers
```bash
# Rails console
docker compose exec web bin/rails console

# Run migrations
docker compose exec web bin/rails db:migrate

# Run tests
docker compose exec web bin/rails test

# Rubocop
docker compose exec web bin/rubocop -a

# Shell access
docker compose exec web bash
```

### Database operations
```bash
# Reset database
docker compose exec web bin/rails db:reset

# Seed database
docker compose exec web bin/rails db:seed

# Create a new migration
docker compose exec web bin/rails generate migration YourMigrationName
```

### Viewing logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web
docker compose logs -f vite
docker compose logs -f db
```

### Installing new dependencies
When Gemfile or package.json changes, rebuild the images:
```bash
docker compose build
docker compose up -d
```

## Troubleshooting

### Ports already in use
If ports 3000, 5173, or 5432 are already in use, edit `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Use port 3001 on host
```

### Changes not reflecting
Code changes should appear immediately (volume mounted). If not:
1. Restart services: `docker compose restart web vite`
2. Check logs: `docker compose logs web vite`

If you changed Gemfile or package.json, rebuild:
```bash
docker compose build
```

### Database connection issues
```bash
# Check if database is healthy
docker compose ps

# Check database logs
docker compose logs db

# Recreate database container
docker compose down
docker compose up -d db
docker compose exec web bin/rails db:prepare
```

### Clean slate
To start fresh (⚠️ **deletes all data**):
```bash
docker compose down -v
docker compose up --build
```

## Services

- **db** - PostgreSQL 17
- **web** - Rails server
- **vite** - Vite dev server

Code changes are reflected automatically via volume mounts.
