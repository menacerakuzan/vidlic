import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { ApprovalActionType, ApprovalEntityType, ApprovalStatus, UserRole } from '@prisma/client';

export interface ApprovalStepDefinition {
  order: number;
  role: UserRole;
  approverId?: string | null;
}

export interface SubmitApprovalInput {
  entityType: ApprovalEntityType;
  entityId: string;
  actorId: string;
  steps: ApprovalStepDefinition[];
  comment?: string;
  resolveApprover?: (role: UserRole, stepOrder: number) => string | null | undefined;
}

export interface ApproveApprovalInput {
  entityType: ApprovalEntityType;
  entityId: string;
  actorId: string;
  comment?: string;
  resolveApprover?: (role: UserRole, stepOrder: number) => string | null | undefined;
}

export interface RejectApprovalInput {
  entityType: ApprovalEntityType;
  entityId: string;
  actorId: string;
  comment: string;
}

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async getActiveFlow(entityType: ApprovalEntityType) {
    const flow = await this.prisma.approvalFlow.findFirst({
      where: { entityType, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    return flow;
  }

  async upsertActiveFlow(
    entityType: ApprovalEntityType,
    steps: Array<{ order: number; role: UserRole; required?: boolean }>,
  ) {
    if (!steps.length) {
      throw new BadRequestException('Approval steps are required');
    }

    const normalized = [...steps]
      .sort((a, b) => a.order - b.order)
      .map((step, index) => ({
        order: index + 1,
        role: step.role,
        required: step.required !== false,
      }));

    const existing = await this.getActiveFlow(entityType);

    if (!existing) {
      return this.prisma.approvalFlow.create({
        data: {
          name: `${entityType.toUpperCase()} default flow`,
          entityType,
          isActive: true,
          steps: {
            create: normalized.map((step) => ({
              stepOrder: step.order,
              role: step.role,
              required: step.required,
            })),
          },
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.deleteMany({ where: { flowId: existing.id } });
      await tx.approvalStep.createMany({
        data: normalized.map((step) => ({
          flowId: existing.id,
          stepOrder: step.order,
          role: step.role,
          required: step.required,
        })),
      });
    });

    return this.getActiveFlow(entityType);
  }

  async submit(input: SubmitApprovalInput) {
    const { entityType, entityId, actorId, steps, comment, resolveApprover } = input;

    if (!steps.length) {
      throw new BadRequestException('Approval steps are required');
    }

    const flow = await this.ensureFlow(entityType, steps);

    const firstStep = steps.sort((a, b) => a.order - b.order)[0];
    const firstApprover = resolveApprover ? resolveApprover(firstStep.role, firstStep.order) : firstStep.approverId;

    const instance = await this.prisma.approvalInstance.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: {
        flowId: flow.id,
        entityType,
        entityId,
        status: ApprovalStatus.pending,
        currentStepOrder: firstStep.order,
        currentApproverId: firstApprover ?? null,
      },
      update: {
        flowId: flow.id,
        status: ApprovalStatus.pending,
        currentStepOrder: firstStep.order,
        currentApproverId: firstApprover ?? null,
      },
    });

    const firstStepRecord = flow.steps.find(step => step.stepOrder === firstStep.order);

    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        action: ApprovalActionType.submit,
        userId: actorId,
        comment,
        stepOrder: firstStep.order,
        stepId: firstStepRecord?.id,
      },
    });

    return instance;
  }

  async approve(input: ApproveApprovalInput) {
    const { entityType, entityId, actorId, comment, resolveApprover } = input;

    const instance = await this.prisma.approvalInstance.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      include: { flow: { include: { steps: true } } },
    });

    if (!instance) {
      throw new BadRequestException('Approval instance not found');
    }

    const sortedSteps = instance.flow.steps.sort((a, b) => a.stepOrder - b.stepOrder);
    const currentIndex = sortedSteps.findIndex(s => s.stepOrder === instance.currentStepOrder);

    const nextStep = sortedSteps[currentIndex + 1];
    const nextApproverId = nextStep && resolveApprover ? resolveApprover(nextStep.role, nextStep.stepOrder) : null;
    const nextStepOrder = nextStep ? nextStep.stepOrder : instance.currentStepOrder;
    const newStatus = nextStep ? ApprovalStatus.pending : ApprovalStatus.approved;

    const updated = await this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: newStatus,
        currentStepOrder: nextStepOrder,
        currentApproverId: nextApproverId ?? null,
      },
    });

    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        action: ApprovalActionType.approve,
        userId: actorId,
        comment,
        stepOrder: instance.currentStepOrder,
        stepId: sortedSteps[currentIndex]?.id,
      },
    });

    return { instance: updated, nextStep };
  }

  async reject(input: RejectApprovalInput) {
    const { entityType, entityId, actorId, comment } = input;

    const instance = await this.prisma.approvalInstance.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      include: { flow: { include: { steps: true } } },
    });

    if (!instance) {
      throw new BadRequestException('Approval instance not found');
    }

    const updated = await this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: ApprovalStatus.rejected,
      },
    });

    const stepRecord = instance.flow.steps.find(step => step.stepOrder === instance.currentStepOrder);

    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        action: ApprovalActionType.reject,
        userId: actorId,
        comment,
        stepOrder: instance.currentStepOrder,
        stepId: stepRecord?.id,
      },
    });

    return updated;
  }

  private async ensureFlow(entityType: ApprovalEntityType, steps: ApprovalStepDefinition[]) {
    const existing = await this.prisma.approvalFlow.findFirst({
      where: { entityType, isActive: true },
      include: { steps: true },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.approvalFlow.create({
      data: {
        name: `${entityType.toUpperCase()} default flow`,
        entityType,
        steps: {
          create: steps.map(step => ({
            stepOrder: step.order,
            role: step.role,
            required: true,
          })),
        },
      },
      include: { steps: true },
    });
  }
}
