import { Types } from 'mongoose';
import { MembershipModel, membershipRoles } from '../models/membership.js';

export type Role = (typeof membershipRoles)[number];

const permissionRoles = {
  'organization:read': ['owner', 'admin', 'accountant', 'viewer'],
  'organization:manage': ['owner', 'admin'],
  'ledger:read': ['owner', 'admin', 'accountant', 'viewer'],
  'ledger:post': ['owner', 'admin', 'accountant'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissionRoles;

/** Never accept authUserId from request body: resolve it from verified auth session. */
export async function hasPermission(authUserId: string, organizationId: string, permission: Permission): Promise<boolean> {
  if (!authUserId || !Types.ObjectId.isValid(organizationId)) return false;
  const membership = await MembershipModel.findOne({
    organizationId: new Types.ObjectId(organizationId), authUserId, status: 'active',
  }).select('role').lean();
  return !!membership && (permissionRoles[permission] as readonly string[]).includes(membership.role);
}
