# Aslibooks data export, retention and deletion decisions

**Status: Draft for owner, accounting and legal review. This is not an approved retention policy, a statement of statutory compliance, or authorization to delete production data.**

This decision record makes the unresolved lifecycle choices visible before production. Until the owner and qualified advisers approve a policy and the corresponding controls are exercised, Aslibooks must not claim to meet account-deletion or data-portability obligations.

## Proposed safe defaults

1. **Posted financial history is append-only in the application.** Correct mistakes through linked reversals or credit notes. Do not delete posted journals, source transactions, or their audit events through an account-closure workflow.
2. **Closing an organization is a reversible lock, not a purge.** Disable new posting and membership access only through an audited workflow; keep authorized read/export access until an approved retention period ends. No organization purge endpoint currently exists.
3. **Member removal revokes access.** It must not delete that person’s authored journal/audit attribution or rewrite historical records. Personal profile erasure and immutable ledger attribution require adviser review.
4. **Exports are authorized disclosures.** Keep report, ledger, contact-statement and organization exports tenant-scoped. The versioned NDJSON records export and the gzip tar full archive are audited, private/no-store and limited to owner/admin/accountant memberships. The full archive contains all current tenant accounting collections, audit events, attachment metadata and original PDF/PNG/JPEG bytes; it removes internal GridFS storage IDs, verifies each attachment's declared size and SHA-256 during streaming, and provides record-collection/attachment manifests plus a completion marker. It is **unencrypted**, is a best-effort sequential export rather than a point-in-time snapshot, and is not a database backup. Verify `complete.json` and the hashes, then protect the downloaded file. It does not provide a consistent point-in-time snapshot, restore process or encryption-at-rest guarantee. Do not describe report CSV/PDF downloads or this archive as a database backup.
5. **Backups follow a documented expiry and restore schedule.** Any future deletion process must account for primary data, GridFS attachment files/chunks, replicas, logs, snapshots and backup expiry. Restore rehearsals must not reintroduce data that a legally approved deletion process removed.
6. **Attachments need a separate content policy.** Production attachment uploads remain gated until malware scanning, retention, purge, orphan cleanup, and encryption-at-rest responsibilities are selected and tested.

## Decisions required before policy approval

| Decision | Proposed default for review | Required approver/evidence |
| --- | --- | --- |
| Applicable retention duration by record class | Leave posted financial, tax, audit and attachment retention unset until qualified Indian accounting/legal advice is documented | Owner plus qualified accountant/legal adviser; cite applicable requirements and effective date |
| Export requester and scope | Organization owner/admin; accountant role is assigned by an owner/admin membership action. Current versioned export includes organization metadata, chart, contacts, products, accounting documents, settlements, journals, periods, bank activity, audit trail and attachment metadata; original attachment bytes are excluded | Owner and privacy/security review; role matrix and tenant-isolation test. Current route tests are at `apps/api/src/routes/organizationDataExport.integration.test.ts`; hosted verification is tracked in `TEST_EVIDENCE.md` |
| Export format and scale | Human-readable report CSV/PDF remains available; full archive requires versioned JSON/CSV, bounded/streamed generation, manifest, checksum, expiry and audit event | Engineering and accounting review; large synthetic dataset test |
| Member personal-data request | Revoke access immediately when authorized; preserve accounting/audit attribution unless advisers approve a lawful redaction strategy | Owner and legal/privacy adviser |
| Organization closure/deletion | Disable posting/access by audited closure; no destructive purge until obligations, backup expiry and irreversibility are resolved | Owner and qualified legal/accounting review; restore/deletion rehearsal |
| Attachment lifecycle | Keep production upload disabled pending malware scanning and retention/purge choices | Owner/security operations; scanning, backup and purge evidence |
| Backup expiry and recovery objectives | Define RPO/RTO and a finite, documented expiry before accepting production data | Owner/operations; provider configuration and restore rehearsal |

## Current product boundary

Aslibooks has tenant-scoped CSV exports for essential reports, a printable financial-report packet, full general-ledger CSV, contact-statement CSV, printable invoices, a versioned NDJSON records export, and a versioned full organization archive. The archive includes original attachment bytes and integrity metadata, but it is unencrypted and not a point-in-time snapshot or backup. Aslibooks does **not** provide an organization deletion workflow, backup-erasure workflow, legal request tracking, archive encryption/key management, or automated restore from the archive. Those capabilities must not be inferred from the narrower exports. Posted journals and audit history are protected by application controls; privileged database access remains a separate trust boundary.

## Release gate

Before production approval: resolve every decision above; have qualified advisers review the policy; implement required export/deletion controls; test roles, tenant isolation, auditability, retention and backup expiry using synthetic data; and attach evidence to the release candidate. Until then, this draft records the blocker but does not close it.
