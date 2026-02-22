#!/bin/bash

# Git Hooks Setup Script for Stellara Contracts
# This script sets up pre-commit and pre-push hooks for code quality checks

set -e  # Exit immediately if a command exits with a non-zero status

HOOKS_DIR=".git/hooks"
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"
PRE_PUSH_HOOK="$HOOKS_DIR/pre-push"

echo "🔧 Setting up Git Hooks for Stellara Contracts..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Create pre-commit hook
cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash

# Pre-commit hook for code quality checks

echo "🔍 Running pre-commit checks..."

# Get the directory containing this script (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Check if rustfmt is available
if ! command -v cargo &> /dev/null || ! command -v rustfmt &> /dev/null; then
    echo "⚠️  cargo or rustfmt not available. Skipping formatting check."
else
    echo "📝 Checking code formatting..."
    if ! cargo fmt --check --all; then
        echo "❌ Code is not properly formatted. Please run 'cargo fmt --all' to fix formatting."
        exit 1
    fi
    echo "✅ Code formatting is correct."
fi

# Check if clippy is available
if ! command -v clippy &> /dev/null; then
    echo "⚠️  clippy not available. Skipping linting check."
else
    echo "🔍 Running Clippy linting..."
    if ! cargo clippy --all-targets --all-features -- -D warnings; then
        echo "❌ Clippy found issues. Please fix linting errors before committing."
        exit 1
    fi
    echo "✅ Clippy passed with no warnings/errors."
fi

echo "✅ All pre-commit checks passed!"
EOF

# Create pre-push hook
cat > "$PRE_PUSH_HOOK" << 'EOF'
#!/bin/bash

# Pre-push hook for additional quality checks

echo "🔍 Running pre-push checks..."

# Get the directory containing this script (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🧪 Running tests before push..."
if ! cargo test --all; then
    echo "❌ Tests failed. Please fix test failures before pushing."
    exit 1
fi

echo "✅ All pre-push checks passed!"
EOF

# Make the hooks executable
chmod +x "$PRE_COMMIT_HOOK"
chmod +x "$PRE_PUSH_HOOK"

echo "✅ Git hooks have been set up successfully!"
echo "Pre-commit hook: Will check formatting and linting before each commit"
echo "Pre-push hook: Will run tests before each push"
echo ""
echo "To run quality checks manually, use:"
echo "  ./scripts/code-quality-check.sh"
echo ""
echo "To format code manually, use:"
echo "  ./scripts/format-code.sh"