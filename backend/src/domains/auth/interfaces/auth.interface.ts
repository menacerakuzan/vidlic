import { UserRole } from '@prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  patronymic?: string;
  role: UserRole;
  departmentId?: string | null;
  department?: {
    id: string;
    name: string;
    nameUk: string;
    code: string;
  };
  position?: {
    id: string;
    title: string;
    titleUk: string;
  };
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  jti: string;
}
