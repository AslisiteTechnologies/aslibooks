import { Types, type ClientSession } from 'mongoose';
import { MembershipModel, membershipRoles } from '../models/membership.js';

export type Role = (typeof membershipRoles)[number];

const permissionRoles = {
  'organization:read': ['owner', 'admin', 'accountant', 'viewer'],
  'organization:manage': ['owner', 'admin'],
  'ledger:read': ['owner', 'admin', 'accountant', 'viewer'],
  'ledger:post': ['owner', 'admin', 'accountant'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissionRoles;

/** Pure policy check; database membership and active status are checked separately. */
export function roleAllows(role: string | null | undefined, permission: Permission): boolean {
  return !!role && (permissionRoles[permission] as readonly string[]).includes(role);
}

/** Never accept authUserId from request body: resolve it from verified auth session. */
export async function hasPermission(authUserId: string, organizationId: string, permission: Permission): Promise<boolean> {
  if (!authUserId || !Types.ObjectId.isValid(organizationId)) return false;
  const membership = await MembershipModel.findOne({
    organizationId: new Types.ObjectId(organizationId), authUserId, status: 'active',
  }).select('role').lean<{ role: Role }>();
  return roleAllows(membership?.role, permission);
}

/**
 * Transactional write fence for ledger posting. Revocation and role updates
 * must write the SAME membership document, creating a MongoDB write conflict
 * if they race with a ledger transaction. A read-only snapshot check cannot
 * provide this guarantee.
 *
 * Invoke inside the SAME transaction as journal and audit writes.
 * A transient conflict must restart the entire transaction and reauthorize.
 */
export async function fenceLedgerPermission(
  authUserId: string,
  organizationId: string,
  session: ClientSession,
): Promise<boolean> {
  if (!authUserId || !Types.ObjectId.isValid(organizationId)) return false;
  const result = await MembershipModel.updateOne(
    {
      organizationId: new Types.ObjectId(organizationId),
      authUserId,
      status: 'active',
      role: { $in: ['owner', 'admin', 'accountant'] },
    },
    { $inc: { ledgerAuthorizationFence: 1 } },
    { session, strict: false },
  );
  return result.matchedCount === 1 && result.modifiedCount === 1;
}
