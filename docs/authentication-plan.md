# Authentication integration gate

Better Auth with MongoDB adapter is the selected authentication framework, but it is **not integrated yet**.

Before implementing login:
1. Verify current Better Auth MongoDB adapter setup and Express integration from official documentation.
2. Confirm Expo/React Native cookie and token handling, secure device storage and logout behavior.
3. Implement signup, verification, password reset, rate limits and trusted email delivery.
4. Resolve user identity only from verified sessions; never trust user IDs in request bodies.
5. Keep business membership/permissions in Mongoose and test cross-tenant denial.
6. Avoid exposing MongoDB URI, Better Auth secret or OpenAI key in browser/mobile bundles.

The current models are a foundation only; they do not constitute working authentication or accounting posting.
