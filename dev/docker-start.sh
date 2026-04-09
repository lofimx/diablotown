#!/bin/bash
set -e

echo "🏰 Starting HellTown..."

if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

cd "$(dirname "$0")"
docker compose up -d

echo ""
echo "⏳ Waiting for services..."
sleep 5

docker compose ps

echo ""
echo "✅ HellTown is ready!"
echo ""
echo "   Game:       http://localhost:3000"
echo "   Map Editor: http://localhost:3000/editor"
echo ""
echo "Commands:"
echo "   Logs:    docker compose logs -f"
echo "   Stop:    docker compose down"
echo "   Rebuild: docker compose build"
echo "   Console: docker compose exec web bin/rails console"
echo "   Tests:   docker compose exec web bin/rails test"
echo ""
echo "Showing logs (Ctrl+C to stop):"
echo ""
docker compose logs -f
