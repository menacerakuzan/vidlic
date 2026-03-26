import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (requiredRoles) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole) {
        return false;
      }
    }

    if (requiredPermissions) {
      const rolePermissions: Record<string, string[]> = {
        admin: ['*'],
        director: [
          'reports:read', 'reports:write', 'reports:approve',
          'tasks:read', 'tasks:write', 'tasks:approve',
          'analytics:read', 'analytics:view',
          'departments:read', 'departments:write',
          'users:read',
          'users:write',
          'notifications:read', 'notifications:write',
          'ai:read', 'ui:read',
        ],
        manager: [
          'reports:read', 'reports:write', 'reports:approve',
          'tasks:read', 'tasks:write',
          'analytics:read', 'analytics:view',
          'departments:read',
          'notifications:read', 'notifications:write',
          'ai:read', 'ui:read',
        ],
        clerk: [
          'reports:read', 'reports:write', 'reports:approve',
          'tasks:read',
          'analytics:read', 'analytics:view',
          'departments:read',
          'notifications:read', 'notifications:write',
          'ai:read', 'ui:read',
        ],
        specialist: [
          'reports:read', 'reports:write',
          'tasks:read', 'tasks:write',
          'notifications:read', 'notifications:write',
          'ai:read', 'ui:read',
        ],
      };
      
      const userPermissions = user.role === 'admin' 
        ? ['*'] 
        : rolePermissions[user.role] || [];
      
      const hasPermission = requiredPermissions.every(permission => 
        userPermissions.includes('*') || userPermissions.includes(permission)
      );
      if (!hasPermission) {
        return false;
      }
    }

    return true;
  }
}
