# Ledger authorization and revocation consistency

Status: **implemented for authorized journal and reversal services**.

## Current boundary

`postAuthorizedJournal` and `postAuthorizedReversal` derive the actor from a
trusted caller and check active organization membership with `ledger:post`.
The posting primitives then conditionally increment the active, permitted
membership's fence inside the journal transaction. Only the authorized wrappers
are suitable entry points for session-authenticated callers.

If suspension commits first, the conditional write fails or the transaction
retries against fresh membership state. If posting obtains the fence first,
suspension can serialize after its commit. Replays also enter the transaction.

## Required consistency contract

1. Authenticate with Better Auth and obtain the actor ID from the verified
   session; never accept an actor ID from JSON.
2. Validate the organization ID and enforce active membership and `ledger:post`
   for **every** attempt, including idempotent replays.
3. A membership change that commits **before** the posting transaction's
   authorization point must deny the operation.
4. For concurrent membership revocation and posting, choose and document an
   explicit serialization point. A read-only membership check in a snapshot
   transaction is **not sufficient**: it can observe an older active membership
   while a concurrent revocation commits.
5. Keep journal, audit event, and any authorization-fencing write in one
   MongoDB transaction; rollback must leave no partial financial records.
6. Keep retry behavior bounded. Never retry a posting under a revoked identity
   without rechecking permission.

## Implementation direction

Use a membership revision/fencing protocol shared by **all** membership
mutations and ledger writes. A ledger transaction must perform a conditional
write against the active membership document (or an equivalent dedicated
fence), while revocation updates that same document. Conflicting concurrent
transactions must be retried from a fresh authorization check. The exact
semantics of operations that begin before revocation but commit afterward must
be tested and documented. A standalone permission read is not a revocation
fence.

Do not add ledger HTTP endpoints until this protocol is implemented and
verified with a replica-set integration test that orchestrates a revocation
racing an in-flight posting. Include equivalent coverage for reversals and
idempotent replays.

## Existing protections

- Active membership/role authorization for guarded service entry points.
- Cross-organization account checks inside posting transactions.
- Atomic journal plus audit creation and unique idempotency constraints.
- Reversal uniqueness, rollback and concurrent-request integration tests.

These protections do not make the accounting API production-ready.
