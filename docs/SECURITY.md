# Security Guidelines

## Mandatory rules
- Never commit secrets, tokens, private keys, or `.env` files.
- Use environment variables for all sensitive configuration.
- Validate every input from the client or user.
- Protect admin-only routes and actions.
- Do not expose stack traces or raw backend errors in production.

## Data handling
- Handle customer data as real business data.
- Keep passwords hashed and never stored in plaintext.
- Reduce access permissions to the minimum required.

## API and app security
- Use secure session or token mechanisms in production.
- Apply rate limiting to login and other sensitive actions.
- Use role-based access control for admin workflows.
- Keep logging useful but avoid storing sensitive secrets, tokens, or payment data.

## Operational security
- Always review `git status` and `git diff` before pushing.
- Use clean and meaningful commit messages.
- Keep the project deployment-ready with HTTPS and health checks.
