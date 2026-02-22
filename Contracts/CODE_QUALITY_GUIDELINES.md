# Code Quality Framework for Stellara Contracts

This document outlines the comprehensive code quality framework implemented for the Stellara Contracts project.

## Overview

The code quality framework ensures consistent, maintainable, and secure Rust smart contracts through automated tooling, standardized practices, and CI/CD integration.

## Components

### 1. Code Formatting

**Tool**: `rustfmt`
- Configured via `.rustfmt.toml` with project-specific settings
- Maximum line width: 100 characters
- 4-space indentation (no tabs)
- Consistent import organization
- Automatic formatting of code structure

**Usage**:
- Format code: `cargo fmt --all`
- Check formatting: `cargo fmt --check --all`
- Manual script: `./scripts/format-code.sh`

### 2. Static Analysis & Linting

**Tool**: `clippy`
- Configured via `clippy.toml` with project-specific settings
- Enforces correctness, style, and performance best practices
- Custom identifier dictionary for blockchain/DeFi terms
- Complexity threshold management

**Usage**:
- Run linter: `cargo clippy --all-targets --all-features -- -D warnings`
- Check for warnings: `cargo clippy --all-targets --all-features`

### 3. Automated Testing

**Tools**: `cargo test`
- Unit tests for all contract functions
- Integration tests for cross-contract interactions
- Property-based tests for complex logic validation

**Usage**:
- Run all tests: `cargo test --all`
- Run specific tests: `cargo test --test test_name`

### 4. Git Hooks

Automated quality checks via Git hooks:
- **Pre-commit**: Runs formatting and linting checks
- **Pre-push**: Runs comprehensive test suite

**Setup**: `./scripts/setup-git-hooks.sh`

### 5. CI/CD Integration

GitHub Actions workflow in `.github/workflows/rust-quality.yml`:
- Runs on every push to main/develop and pull requests
- Formatting checks
- Clippy linting with strict error settings
- Test execution
- Unused dependency detection

## Quality Metrics

### Complexity Management
- Cyclomatic complexity threshold: 25
- Function parameter limit: 10
- Type complexity monitoring

### Documentation Standards
- Complete documentation for all public APIs
- Inline documentation for complex logic
- Example code for key functions

## Development Workflow

### Local Development
1. Make code changes
2. Run `cargo fmt --all` to format code
3. Run `cargo clippy` to check for linting issues
4. Run `cargo test` to execute tests
5. Commit (pre-commit hook will run checks automatically)

### Pull Request Process
1. Push changes to feature branch
2. GitHub Actions runs comprehensive quality checks
3. Address any issues flagged by CI
4. Code review includes quality standards verification
5. Merge after all checks pass

## Configuration Files

### `.rustfmt.toml`
Project-specific formatting rules for consistent code style.

### `clippy.toml`
Custom linting configuration with DeFi/blockchain term recognition.

### GitHub Actions Workflow
`.github/workflows/rust-quality.yml` - Automated quality checks on CI/CD.

## Scripts

### `scripts/code-quality-check.sh`
Comprehensive quality check script that runs:
- Formatting validation
- Clippy linting
- All tests
- Documentation tests

### `scripts/format-code.sh`
Format all code according to project standards.

### `scripts/setup-git-hooks.sh`
Set up automated Git hooks for pre-commit and pre-push quality checks.

## Standards Documentation

Detailed coding standards are documented in `RUST_CODING_STANDARDS.md` covering:
- Naming conventions
- Documentation requirements
- Error handling patterns
- Performance considerations
- Security best practices
- Soroban-specific guidelines

## Maintenance

### Regular Reviews
- Monthly review of linting rules
- Quarterly assessment of complexity thresholds
- Ongoing improvement of standards documentation

### Updates
- Keep Rust toolchain updated
- Regular review of new Clippy lints
- Periodic updates to formatting standards

## Benefits

This framework provides:
- **Consistency**: Uniform code style across all contracts
- **Quality**: Early detection of potential issues
- **Security**: Proactive identification of vulnerabilities
- **Maintainability**: Clear standards and automated enforcement
- **Efficiency**: Reduced time spent on code reviews for style issues
- **Reliability**: Higher confidence in code correctness