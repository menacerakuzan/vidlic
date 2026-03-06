import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApprovalEntityType, UserRole } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Permissions } from '../auth/decorators/roles.decorator';
import { ApprovalsService } from './approvals.service';

class FlowStepDto {
  @IsInt()
  @Min(1)
  order: number;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  required?: boolean;
}

class UpsertFlowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowStepDto)
  steps: FlowStepDto[];
}

@ApiTags('approvals')
@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ApprovalsController {
  constructor(private approvalsService: ApprovalsService) {}

  @Get('flows/:entityType')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Отримати активний flow погодження для сутності' })
  @ApiResponse({ status: 200, description: 'Flow погодження' })
  async getFlow(@Param('entityType') entityType: ApprovalEntityType) {
    const flow = await this.approvalsService.getActiveFlow(entityType);
    if (!flow) {
      return { entityType, steps: [] };
    }

    return {
      id: flow.id,
      name: flow.name,
      entityType: flow.entityType,
      steps: flow.steps.map((step) => ({
        order: step.stepOrder,
        role: step.role,
        required: step.required,
      })),
    };
  }

  @Put('flows/:entityType')
  @Roles('admin', 'director')
  @Permissions('reports:approve')
  @ApiOperation({ summary: 'Оновити flow погодження для сутності' })
  @ApiResponse({ status: 200, description: 'Flow оновлено' })
  async upsertFlow(@Param('entityType') entityType: ApprovalEntityType, @Body() dto: UpsertFlowDto) {
    const flow = await this.approvalsService.upsertActiveFlow(entityType, dto.steps);
    return {
      id: flow?.id,
      entityType,
      steps: flow?.steps.map((step) => ({
        order: step.stepOrder,
        role: step.role,
        required: step.required,
      })) || [],
    };
  }
}
