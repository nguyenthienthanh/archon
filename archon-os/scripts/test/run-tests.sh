#!/bin/bash

# Run Tests Script
# Executes all tests with coverage

set -e

echo "🧪 Running All Tests..."
echo ""

# Detect project type and run appropriate tests
if [ -f "package.json" ]; then
    if grep -q "react-native" package.json; then
        echo "📱 React Native project detected"
        npm test -- --coverage --watchAll=false
    elif grep -q "next" package.json; then
        echo "🌐 Next.js project detected"
        npm test -- --coverage
    else
        echo "⚛️  React project detected"
        npm test -- --coverage --watchAll=false
    fi
elif [ -f "composer.json" ]; then
    echo "🐘 Laravel project detected"
    php artisan test --coverage
else
    echo "❌ Unknown project type"
    exit 1
fi

echo ""
echo "✅ Tests complete"

