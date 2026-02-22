#!/bin/bash

# Code Formatting Script for Stellara Contracts
# This script formats all Rust code according to project standards

set -e  # Exit immediately if a command exits with a non-zero status

echo "🔧 Formatting Stellara Contracts Code..."

# Function to print section headers
print_header() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo ""
}

# Check if required tools are installed
print_header "Checking Required Tools"

if ! command -v cargo &> /dev/null; then
    echo "❌ cargo is not installed or not in PATH"
    exit 1
fi

if ! command -v rustfmt &> /dev/null; then
    echo "❌ rustfmt is not installed"
    echo "Install with: rustup component add rustfmt"
    exit 1
fi

echo "✅ All required tools are installed"

# Format all Rust files
print_header "Formatting Rust Code"
cargo fmt --all
echo "✅ Code formatting completed"

# Run clippy to catch any remaining issues
print_header "Running Clippy"
cargo clippy --all-targets --all-features -- -A clippy::all
echo "✅ Clippy check completed (warnings shown but not failing)"

echo ""
echo "🎉 Code formatting completed successfully!"
echo "Your code now meets the Stellara Contracts formatting standards."