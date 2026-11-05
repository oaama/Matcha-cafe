import { cookies } from 'next/headers';
import { getStaffIdentity, STAFF_SESSION_COOKIE } from './staff-auth';
import type { StaffIdentity, StaffRole } from './staff-types';

export async function getRequestStaff(): Promise<StaffIdentity | null> {
  return getStaffIdentity((await cookies()).get(STAFF_SESSION_COOKIE)?.value);
}

export async function requireStaffRole(roles: StaffRole[] = ['ADMIN', 'EMPLOYEE']) {
  const staff = await getRequestStaff();
  if (!staff || !roles.includes(staff.role)) return null;
  return staff;
}
