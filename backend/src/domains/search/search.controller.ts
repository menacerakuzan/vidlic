import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Глобальний пошук по звітах, задачах та користувачах' })
  @ApiResponse({ status: 200, description: 'Результати пошуку' })
  global(@Query('q') q: string, @Req() req: any) {
    return this.searchService.global(q, req.user);
  }
}
