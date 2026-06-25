import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Single canonical implementation of department scope resolution.
 * Previously copy-pasted across 7 services with diverging logic.
 * Injected globally via SharedModule.
 */
@Injectable()
export class DepartmentScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns all department IDs in the same "family" as the given department:
   * the root parent + all its direct children.
   */
  async resolveFamilyIds(departmentId?: string | null): Promise<string[]> {
    if (!departmentId) return [];

    const current = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, parentId: true },
    });
    if (!current) return [];

    const rootId = current.parentId || current.id;
    const root = await this.prisma.department.findUnique({
      where: { id: rootId },
      select: { id: true, children: { select: { id: true } } },
    });

    if (!root) return [departmentId];
    return [root.id, ...(root.children ?? []).map((c) => c.id)];
  }

  /**
   * Expands a list of department IDs to include their direct children.
   */
  async expandWithChildren(departmentIds: string[]): Promise<string[]> {
    const expanded = new Set(departmentIds);
    for (const id of departmentIds) {
      const dept = await this.prisma.department.findUnique({
        where: { id },
        select: { children: { select: { id: true } } },
      });
      for (const child of dept?.children ?? []) expanded.add(child.id);
    }
    return Array.from(expanded);
  }

  /**
   * Returns the full set of department IDs visible to the given user,
   * respecting their role and configured scope.
   *
   * Role behavior:
   * - admin: returns [] (caller should treat as "all departments")
   * - director: all departments in their org family (root + children)
   * - deputy_director / deputy_head: configured scopeDepartmentIds + children,
   *   or falls back to family if not configured
   * - manager: own department + secondaryDepartmentIds
   * - clerk / specialist / lawyer / accountant / hr: own department only
   */
  async resolveScopedIds(user: any): Promise<string[]> {
    if (!user) return [];
    if (user.role === 'admin') return [];

    if (user.role === 'director') {
      return this.resolveFamilyIds(user.departmentId);
    }

    if (user.role === 'deputy_director' || user.role === 'deputy_head') {
      const configured: string[] = Array.isArray(user.scopeDepartmentIds)
        ? user.scopeDepartmentIds.filter(Boolean)
        : [];

      if (configured.length > 0) {
        const base = [user.departmentId, ...configured].filter(Boolean);
        return this.expandWithChildren([...new Set(base)]);
      }
      return this.resolveFamilyIds(user.departmentId);
    }

    if (user.role === 'manager') {
      const secondary: string[] = Array.isArray(user.secondaryDepartmentIds)
        ? (user.secondaryDepartmentIds as string[]).filter(Boolean)
        : [];
      return [...new Set([user.departmentId, ...secondary].filter(Boolean))];
    }

    // specialist, clerk, lawyer, accountant, hr — own department only
    return user.departmentId ? [user.departmentId] : [];
  }

  /**
   * Returns scoped IDs but treats admin as seeing ALL (returns null → no WHERE filter).
   * Use in findAll queries: `if (ids !== null) where.departmentId = { in: ids }`.
   */
  async resolveScopedIdsOrNull(user: any): Promise<string[] | null> {
    if (!user || user.role === 'admin') return null;
    return this.resolveScopedIds(user);
  }
}
