# Rust Coding Standards for Stellara Contracts

This document outlines the coding standards and best practices for Rust smart contracts in the Stellara project.

## Table of Contents
1. [Code Formatting](#code-formatting)
2. [Naming Conventions](#naming-conventions)
3. [Documentation Standards](#documentation-standards)
4. [Error Handling](#error-handling)
5. [Performance Considerations](#performance-considerations)
6. [Security Considerations](#security-considerations)
7. [Testing Standards](#testing-standards)
8. [Soroban-Specific Guidelines](#soroban-specific-guidelines)

## Code Formatting

All code must adhere to the formatting rules defined in `.rustfmt.toml`:
- Maximum line width: 100 characters
- Tab size: 4 spaces (no tabs)
- Unix-style line endings
- Import organization using `group_imports = "StdExternalCrate"`
- Function parameters layout: Tall style

Run `cargo fmt` to automatically format your code.

## Naming Conventions

### General Rules
- Use `snake_case` for function names, variable names, and module names
- Use `PascalCase` for struct names, enum names, and trait names
- Use `SCREAMING_SNAKE_CASE` for constants

### Specific Cases
- Contract function names: `snake_case` (e.g., `transfer_tokens`, `get_balance`)
- Structs: `PascalCase` (e.g., `TokenMetadata`, `UserAccount`)
- Enums: `PascalCase` (e.g., `TokenType`, `TransactionStatus`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_SUPPLY`, `DECIMALS`)

## Documentation Standards

### Public APIs
All public functions, structs, enums, and traits must have documentation comments:

```rust
/// Transfers tokens from one account to another.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `from` - The address of the sender
/// * `to` - The address of the recipient
/// * `amount` - The amount of tokens to transfer
///
/// # Panics
/// Panics if the sender doesn't have sufficient balance or is not authorized.
pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
    // Implementation
}
```

### Internal Functions
Internal functions should have documentation when their purpose isn't obvious.

## Error Handling

### Result vs Panic
- Use `panic!` for unrecoverable errors that should terminate execution
- Use `Result<T, E>` when errors are expected and can be handled by callers
- For smart contracts, prefer panics over returning errors when appropriate for transaction atomicity

### Panic Messages
Provide clear, descriptive panic messages:
```rust
if amount < 0 {
    panic!("Amount cannot be negative");
}
```

### Avoid unwrap() in Production
- Avoid `.unwrap()` and `.expect()` in production code
- Use proper error handling with `match`, `if let`, or `?` operator
- If using unwrap/expect is necessary, provide a clear explanation

## Performance Considerations

### Memory Usage
- Be mindful of memory allocation in contract storage
- Use efficient data structures appropriate for the use case
- Minimize unnecessary copying of data

### Gas Optimization
- Optimize loops and recursion to minimize gas costs
- Consider batch operations where appropriate
- Be aware of the computational complexity of operations

### Storage Operations
- Limit the number of storage reads/writes
- Batch related operations when possible
- Consider the cost of storage expansion

## Security Considerations

### Input Validation
- Always validate external inputs
- Check for integer overflow/underflow
- Validate addresses and amounts

### Authorization
- Use `require_auth()` for critical operations
- Implement proper access control checks
- Verify caller permissions before executing operations

### Reentrancy
- Be cautious of potential reentrancy attacks
- Follow the "checks-effects-interactions" pattern

## Testing Standards

### Unit Tests
- Write unit tests for all public functions
- Test edge cases and error conditions
- Use descriptive test names

### Property-Based Tests
- Consider property-based testing for complex functions
- Test invariants that should hold true

### Mocking
- Use Soroban's built-in mocking capabilities for testing
- Mock external dependencies when appropriate

## Soroban-Specific Guidelines

### Contract Implementation
- Use `#[contract]` and `#[contractimpl]` macros appropriately
- Implement proper event publishing for important operations
- Use `contracttype` for data structures that go into storage

### Storage Patterns
- Use appropriate storage keys (`DataKey` enum)
- Consider storage lifetime and access patterns
- Implement proper cleanup for temporary data

### Events
- Publish events for important state changes
- Use structured event data for easier indexing
- Follow consistent event naming conventions

### Authorization
- Always authenticate critical operations
- Use proper admin patterns where applicable
- Implement role-based access control when needed

## Code Quality Tools

### Clippy
All code must pass Clippy linting with the configured rules. Pay special attention to:
- Correctness lints (errors)
- Style lints (warnings)
- Complexity lints (maintainability)

### Continuous Integration
- All code must pass CI checks before merging
- Formatting, linting, and tests must all pass
- Code coverage requirements may apply to critical components

## Review Process

Code reviews should check for adherence to these standards in addition to functionality and security considerations. Reviewers should ensure:

- Code follows established patterns
- Documentation is complete and accurate
- Error handling is appropriate
- Performance considerations are addressed
- Security best practices are followed