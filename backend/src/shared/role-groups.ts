/**
 * Canonical role group constants for consistent access control.
 * Use these instead of inline string arrays throughout all services.
 */

/** Roles that submit individual reports and see only their own data */
export const INDIVIDUAL_CONTRIBUTOR_ROLES = ['specialist', 'lawyer', 'accountant', 'hr'] as const;

/** Roles that manage a department and see all reports/tasks within their scope */
export const DEPARTMENT_LEADERSHIP_ROLES = ['manager', 'deputy_head'] as const;

/** Roles with organization-wide or cross-department authority */
export const ORG_LEADERSHIP_ROLES = ['director', 'deputy_director', 'clerk'] as const;

/** All roles that can approve reports at some level */
export const APPROVER_ROLES = ['manager', 'clerk', 'director', 'deputy_director', 'deputy_head'] as const;

/** All privileged roles (see more data than own records) */
export const PRIVILEGED_ROLES = [
  'admin',
  'director',
  'deputy_director',
  'deputy_head',
  'manager',
  'clerk',
] as const;

export type IndividualContributorRole = (typeof INDIVIDUAL_CONTRIBUTOR_ROLES)[number];
export type DepartmentLeadershipRole = (typeof DEPARTMENT_LEADERSHIP_ROLES)[number];
export type OrgLeadershipRole = (typeof ORG_LEADERSHIP_ROLES)[number];

export function isIndividualContributor(role: string): boolean {
  return (INDIVIDUAL_CONTRIBUTOR_ROLES as readonly string[]).includes(role);
}

export function isPrivileged(role: string): boolean {
  return (PRIVILEGED_ROLES as readonly string[]).includes(role) || role === 'admin';
}
