#!/bin/bash

# Coverage Report Script
# Generates and displays test coverage report

set -e

echo "📊 Generating Coverage Report..."
echo ""

# Run tests with coverage
if [ -f "package.json" ]; then
    npm test -- --coverage --watchAll=false --coverageReporters="text" "lcov" "html"
    
    # Open HTML report if available
    if [ -f "coverage/lcov-report/index.html" ]; then
        echo ""
        echo "✅ Coverage report generated"
        echo "📄 HTML Report: coverage/lcov-report/index.html"
        
        # Open in browser (macOS)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open coverage/lcov-report/index.html
        fi
    fi
elif [ -f "composer.json" ]; then
    php artisan test --coverage --min=80
fi

echo ""
echo "✅ Coverage report complete"

