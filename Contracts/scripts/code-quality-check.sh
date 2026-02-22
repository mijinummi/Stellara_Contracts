#!/bin/bash

# Code Quality Check Script for Stellara Contracts
# This script runs all code quality checks for Rust contracts

set -e  # Exit immediately if a command exits with a non-zero status

echo "🔍 Running Stellara Contracts Code Quality Checks..."

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

if ! command -v cargo-clippy &> /dev/null; then
    echo "❌ clippy is not installed"
    echo "Install with: rustup component add clippy"
    exit 1
fi

echo "✅ All required tools are installed"

# Run cargo fmt check
print_header "Running rustfmt Check"
if cargo fmt --check --all; then
    echo "✅ All files are properly formatted"
else
    echo "❌ Some files need formatting. Run 'cargo fmt --all' to fix them."
    exit 1
fi

# Run clippy
print_header "Running Clippy Linting"
if cargo clippy --all-targets --all-features -- -D warnings; then
    echo "✅ Clippy passed with no warnings/errors"
else
    echo "❌ Clippy found issues that need to be fixed"
    exit 1
fi

# Run tests
print_header "Running Tests"
if cargo test --all; then
    echo "✅ All tests passed"
else
    echo "❌ Some tests failed"
    exit 1
fi

# Run doc tests
print_header "Running Documentation Tests"
if cargo test --doc --all; then
    echo "✅ All documentation tests passed"
else
    echo "❌ Some documentation tests failed"
    exit 1
fi

# Check for dead code (optional, can be skipped in CI for performance)
print_header "Checking for Dead Code (Optional)"
cargo clippy --all-targets --all-features -- -W clippy::dead_code || echo "⚠️  Dead code warnings (may include legitimate dead code)"

echo ""
echo "🎉 All code quality checks passed!"
echo "Your code meets the Stellara Contracts quality standards."