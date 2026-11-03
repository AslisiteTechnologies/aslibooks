# Authentication implementation notes

Auth routes are mounted under `/api/auth/*` using Better Auth's Node handler and a MongoDB adapter. This is an initial integration, not yet production-hardened.

## Local configuration
- `MONGODB_URI`: MongoDB Atlas connection string with transactions enabled
- `MONGODB_DB_NAME`: database name (default `aslibooks`)
- `BETTER_AUTH_SECRET`: random secret at least 32 characters
- `BETTER_AUTH_URL`: API origin, e.g. `http://localhost:4000`
- `WEB_ORIGIN`: permitted web origin, e.g. `http://localhost:5173`

Better Auth maintains its own user/session collections using the native MongoDB driver; business collections use Mongoose on the same database. The organization API resolves the user from a verified Better Auth session and creates an owner membership in the same MongoDB transaction as the organization.

## Remaining gates
- Configure trusted production origins, HTTPS, email verification and password reset delivery.
- Add authentication/session, CSRF, rate limiting, and cross-tenant integration tests.
- Validate Expo integration and secure session storage.
- Add explicit request-size limits, audit events and abuse protection.
- Do not deploy financial data without these gates.
