#!/bin/bash

echo "🚀 Setting up Code Quality Predictor SaaS Development Environment"
echo "================================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
print_status "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi
print_success "Docker is running"

# Start database and services
print_status "Starting database and Redis..."
if docker-compose up -d; then
    print_success "Database services started"
else
    print_error "Failed to start database services"
    exit 1
fi

# Wait for database to be ready
print_status "Waiting for database to initialize..."
sleep 15

# Test database connection
print_status "Testing database connection..."
if PGPASSWORD=postgres123 psql -h localhost -p 5433 -U postgres -d code_quality_predictor -c "SELECT COUNT(*) FROM profiles;" > /dev/null 2>&1; then
    print_success "Database connection successful"
else
    print_error "Database connection failed"
    print_warning "Checking database logs..."
    docker-compose logs postgres | tail -10
    exit 1
fi

# Install backend dependencies
print_status "Installing backend dependencies..."
cd backend
if npm install; then
    print_success "Backend dependencies installed"
else
    print_error "Failed to install backend dependencies"
    exit 1
fi

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd ../frontend
if npm install; then
    print_success "Frontend dependencies installed"
else
    print_error "Failed to install frontend dependencies"
    exit 1
fi

cd ..

# Create .env files if they don't exist
if [ ! -f backend/.env ]; then
    print_status "Creating backend .env file..."
    cp backend/.env.example backend/.env
    print_warning "Please update backend/.env with your API keys"
fi

# Display access information
echo ""
echo "🎉 Development Environment Setup Complete!"
echo "==========================================="
echo ""
echo "📊 Services:"
echo "  • Database (PostgreSQL): localhost:5433"
echo "  • Redis: localhost:6379"
echo "  • PgAdmin: http://localhost:5050"
echo "    - Email: admin@codequalitypredictor.com"
echo "    - Password: admin123"
echo ""
echo "🔧 To start development servers:"
echo "  Backend API:  cd backend && npm run dev"
echo "  Frontend App: cd frontend && npm run dev"
echo ""
echo "🧪 Test the API:"
echo "  curl http://localhost:3001/health"
echo ""
echo "📝 Default admin user (for testing):"
echo "  Email: admin@codequalitypredictor.com"
echo "  Password: admin123"
echo ""
echo "💡 Next steps:"
echo "  1. Update backend/.env with your Stripe keys"
echo "  2. Start both servers in separate terminals"
echo "  3. Visit http://localhost:3000 for the dashboard"
echo "  4. Install the VS Code extension and configure API endpoint"
echo ""
print_success "Ready to start development!"