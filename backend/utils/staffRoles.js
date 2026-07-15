export const STAFF_ROLES = Object.freeze([
  "employee",
  "cashier",
  "kitchen",
  "manager",
  "admin",
  "owner",
]);

const ASSIGNABLE_ROLES = Object.freeze({
  // Managers may add general employees, but granting POS/kitchen/management
  // access is an elevation reserved for admin/owner.
  manager: new Set(["employee"]),
  // Admins may delegate day-to-day management, but cannot create peers or
  // owners. Only an owner can change protected owner/admin accounts.
  admin: new Set(["employee", "cashier", "kitchen", "manager"]),
  owner: new Set(STAFF_ROLES),
});

const MANAGEABLE_ROLES = Object.freeze({
  manager: new Set(["employee", "cashier", "kitchen"]),
  admin: new Set(["employee", "cashier", "kitchen", "manager"]),
  owner: new Set(STAFF_ROLES),
});

export const isStaffRole = (role) => STAFF_ROLES.includes(role);

export const canAssignStaffRole = (actorRole, nextRole) =>
  Boolean(ASSIGNABLE_ROLES[actorRole]?.has(nextRole));

export const canManageStaffRole = (actorRole, targetRole) =>
  Boolean(MANAGEABLE_ROLES[actorRole]?.has(targetRole));

export const manageableRolesFor = (actorRole) =>
  [...(MANAGEABLE_ROLES[actorRole] || [])];

export const assignableRolesFor = (actorRole) =>
  [...(ASSIGNABLE_ROLES[actorRole] || [])];

export const isRoleAllowed = (role, allowedRoles = []) =>
  allowedRoles.length === 0 || allowedRoles.includes(role);
