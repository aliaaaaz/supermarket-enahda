# SuperMarket eNahda — Copilot Instructions

## Project Role
You are the implementation assistant for the SuperMarket eNahda ecommerce platform.

The project is a real-world supermarket ecommerce system designed to be secure, scalable, maintainable, responsive, and production-ready.

---

## Core Principle
BUILD → TEST → SECURE → REVIEW → COMMIT

Do not sacrifice security or maintainability for speed.

---

## Architecture
Do not change the project's architecture, framework, database strategy, authentication strategy, or major dependencies without explicit approval.

Prefer simple and maintainable solutions.

Avoid unnecessary abstraction and overengineering.

---

## Code Quality
Write:

- readable code
- maintainable code
- modular components
- reusable functions
- clear naming
- small focused components
- consistent formatting

Avoid:

- duplicated logic
- unnecessary dependencies
- giant components
- hidden side effects
- magic values
- dead code

---

## Security
Treat all user input as untrusted.

Never:

- expose secrets
- hard-code API keys
- hard-code passwords
- expose database credentials
- commit .env files
- disable authentication to make something work
- bypass authorization
- trust client-side permissions
- store plaintext passwords
- expose sensitive production errors

Always validate and sanitize input where appropriate.

Use secure authentication and authorization patterns.

---

## Authentication
Authentication and authorization are different.

Always verify authorization on the server/API boundary.

Never rely only on frontend checks for admin access.

---

## Database
Use safe parameterized queries or a secure ORM/query builder.

Never construct unsafe SQL using raw user input.

Validate data before persistence.

---

## API
API endpoints must validate:

- authentication
- authorization
- input
- types
- required fields
- business rules

Return safe errors.

Do not expose internal implementation details.

---

## Frontend Security
Do not insert untrusted HTML.

Avoid unsafe HTML rendering.

Do not store sensitive secrets in frontend code.

Remember that frontend code is visible to users.

---

## Admin Security
Admin functionality must be protected by server-side authorization.

Do not assume that hiding a button makes an action secure.

---

## Environment Variables
Secrets belong in environment variables.

Never commit:

.env
.env.local
credentials
tokens
private keys

---

## Git
Use meaningful commits.

Examples:

feat: add product catalog

fix: secure admin authorization

test: add order API tests

refactor: simplify product service

docs: update architecture

---

## Testing
When implementing important business logic, consider tests.

Important areas:

- authentication
- authorization
- products
- inventory
- cart
- checkout
- orders
- payments
- admin actions

---

## Performance
Prefer efficient implementations.

Avoid unnecessary renders.

Optimize images.

Use pagination where appropriate.

Avoid unnecessary network requests.

---

## Accessibility
Use semantic HTML.

Support keyboard navigation.

Provide accessible labels.

Use alt text for meaningful images.

Maintain usable focus states.

---

## Responsive Design
The application must work on:

mobile

tablet
desktop

Mobile-first design is preferred.

---

## Internationalization
The application must eventually support:

Arabic

English

French

Arabic requires RTL support.

Do not hard-code UI text in a way that makes future localization difficult.

---

## Error Handling
Handle errors explicitly.

Do not silently ignore failures.

Production errors must not expose:

- stack traces
- credentials
- internal paths
- database details
- sensitive information

---

## Dependencies
Before introducing a major dependency:

consider:

- security
- maintenance
- compatibility
- bundle size
- necessity

Do not add libraries just because they are popular.

---

## File Organization
Keep responsibilities separated.

Do not put business logic everywhere.

Follow the architecture defined by the project.

---

## AI Rules
AI-generated code must be reviewed.

Never blindly accept large Copilot suggestions.

If a suggestion conflicts with:

- security
- architecture
- validation
- authorization
- project conventions

Do not implement it automatically.

---

## Important Rule
If you are unsure about an architectural or security decision:

STOP and ask for clarification.

Do not invent a solution.

---

## Final Rule
The goal is not merely to make the code run.

The goal is to build a real, secure, maintainable ecommerce platform.
