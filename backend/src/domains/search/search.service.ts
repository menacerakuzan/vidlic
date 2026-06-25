import { Injectable } from '@nestjs/common';
import { DepartmentScopeService } from '../../shared/department-scope.service';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private deptScope: DepartmentScopeService,
  ) {}

  async global(query: string, user: any) {
    const q = (query || '').trim();
    if (!q) {
      return { reports: [], tasks: [], users: [] };
    }

    const reportWhere: any = {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { firstName: { contains: q, mode: 'insensitive' } } },
        { author: { lastName: { contains: q, mode: 'insensitive' } } },
      ],
    };
    const taskWhere: any = {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    };
    const usersWhere: any = {
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    };

    if (['specialist', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      reportWhere.authorId = user.id;
      taskWhere.OR = [
        ...(taskWhere.OR || []),
        { assigneeId: user.id },
        { reporterId: user.id },
      ];
      // Specialists can find colleagues in their own department (for task assignment)
      usersWhere.departmentId = user.departmentId;
    } else if (['manager', 'clerk', 'director', 'deputy_director', 'deputy_head'].includes(user.role)) {
      const scopedDepartmentIds = await this.deptScope.resolveScopedIds(user);
      const safeIds = scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean);
      // Leaders cannot see draft reports from other authors
      reportWhere.departmentId = { in: safeIds };
      reportWhere.OR = [
        { status: { not: 'draft' } },
        { authorId: user.id },
      ];
      taskWhere.departmentId = { in: safeIds };
      usersWhere.departmentId = { in: safeIds };
    }

    const [reports, tasks, users] = await Promise.all([
      this.prisma.report.findMany({
        where: reportWhere,
        take: 8,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        take: 8,
        orderBy: { updatedAt: 'desc' },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.user.findMany({
        where: usersWhere,
        take: user.role === 'specialist' ? 1 : 8,
        orderBy: { lastName: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          department: { select: { id: true, nameUk: true } },
        },
      }),
    ]);

    return {
      reports: reports.map((item) => ({
        id: item.id,
        title: item.title || 'Звіт без назви',
        status: item.status,
        updatedAt: item.updatedAt,
        authorName: `${item.author?.firstName || ''} ${item.author?.lastName || ''}`.trim(),
      })),
      tasks: tasks.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        updatedAt: item.updatedAt,
        assigneeName: item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}` : '',
      })),
      users: users.map((item) => ({
        id: item.id,
        fullName: `${item.firstName} ${item.lastName}`.trim(),
        role: item.role,
        departmentName: item.department?.nameUk || '',
      })),
    };
  }

}
