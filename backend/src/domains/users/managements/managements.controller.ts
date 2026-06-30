import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ManagementsService } from './managements.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

class CreateManagementDto {
  name: string;
  nameUk: string;
  departmentId: string;
  headId?: string;
}

class UpdateManagementDto {
  name?: string;
  nameUk?: string;
  headId?: string | null;
}

class SectionIdsDto {
  sectionIds: string[];
}

@ApiTags('managements')
@Controller('managements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ManagementsController {
  constructor(private managementsService: ManagementsService) {}

  @Get()
  @ApiOperation({ summary: 'Отримати управління підрозділу' })
  @ApiResponse({ status: 200, description: 'Список управлінь' })
  findAll(@Query('departmentId') departmentId: string, @Req() req: any) {
    return this.managementsService.findAll(departmentId, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Отримати управління за ID' })
  @ApiResponse({ status: 200, description: 'Дані управління' })
  @ApiResponse({ status: 404, description: 'Управління не знайдено' })
  findOne(@Param('id') id: string) {
    return this.managementsService.findOne(id);
  }

  @Post()
  @Roles('admin', 'director', 'deputy_director')
  @ApiOperation({ summary: 'Створити управління (Admin/Director)' })
  @ApiResponse({ status: 201, description: 'Управління створено' })
  create(@Body() dto: CreateManagementDto, @Req() req: any) {
    return this.managementsService.create(dto, req.user, req.ip);
  }

  @Put(':id')
  @Roles('admin', 'director', 'deputy_director')
  @ApiOperation({ summary: 'Оновити управління (Admin/Director)' })
  @ApiResponse({ status: 200, description: 'Управління оновлено' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateManagementDto,
    @Req() req: any,
  ) {
    return this.managementsService.update(id, dto, req.user, req.ip);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Видалити управління (Admin)' })
  @ApiResponse({ status: 200, description: 'Управління видалено' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.managementsService.delete(id, req.user, req.ip);
  }

  @Put(':id/sections')
  @Roles('admin', 'director', 'deputy_director')
  @ApiOperation({ summary: 'Призначити відділи до управління' })
  @ApiResponse({ status: 200, description: 'Відділи призначено' })
  assignSections(
    @Param('id') id: string,
    @Body() dto: SectionIdsDto,
    @Req() req: any,
  ) {
    return this.managementsService.assignSections(
      id,
      dto.sectionIds,
      req.user,
      req.ip,
    );
  }

  @Delete(':id/sections')
  @Roles('admin', 'director', 'deputy_director')
  @ApiOperation({ summary: 'Відкріпити відділи від управління' })
  @ApiResponse({ status: 200, description: 'Відділи відкріплено' })
  removeSections(
    @Param('id') id: string,
    @Body() dto: SectionIdsDto,
    @Req() req: any,
  ) {
    return this.managementsService.removeSections(
      id,
      dto.sectionIds,
      req.user,
      req.ip,
    );
  }
}
