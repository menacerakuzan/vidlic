import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto, UpdateUserPasswordDto, UpdateOwnProfileDto } from './dto/users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Permissions } from '../auth/decorators/roles.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Permissions('users:read')
  @ApiOperation({ summary: 'Отримати список користувачів' })
  @ApiResponse({ status: 200, description: 'Список користувачів' })
  findAll(@Query() query: UserQueryDto, @Req() req: any) {
    return this.usersService.findAll(query, req.user);
  }

  @Get(':id')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Отримати користувача за ID' })
  @ApiResponse({ status: 200, description: 'Дані користувача' })
  @ApiResponse({ status: 404, description: 'Користувача не знайдено' })
  findById(@Param('id') id: string, @Req() req: any) {
    return this.usersService.findById(id, req.user);
  }

  @Post()
  @Roles('admin', 'director', 'deputy_director')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Створити користувача (Admin)' })
  @ApiResponse({ status: 201, description: 'Користувач створений' })
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.usersService.create(dto, req.user, req.ip);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Оновити власний профіль (аватар)' })
  @ApiResponse({ status: 200, description: 'Профіль оновлено' })
  updateOwnProfile(@Body() dto: UpdateOwnProfileDto, @Req() req: any) {
    return this.usersService.updateOwnProfile(req.user.id, dto);
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Змінити власний пароль' })
  @ApiResponse({ status: 200, description: 'Пароль оновлено' })
  changeOwnPassword(@Body() dto: UpdateUserPasswordDto, @Req() req: any) {
    return this.usersService.updatePassword(req.user.id, dto, req.user, req.ip);
  }

  @Put(':id')
  @Roles('admin', 'director', 'deputy_director')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Оновити користувача (Admin)' })
  @ApiResponse({ status: 200, description: 'Користувач оновлений' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(id, dto, req.user, req.ip);
  }

  @Put(':id/password')
  @Roles('admin')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Змінити пароль користувача (Admin)' })
  @ApiResponse({ status: 200, description: 'Пароль оновлено' })
  updatePassword(@Param('id') id: string, @Body() dto: UpdateUserPasswordDto, @Req() req: any) {
    return this.usersService.updatePassword(id, dto, req.user, req.ip);
  }

  @Delete(':id')
  @Roles('admin', 'director', 'deputy_director')
  @Permissions('users:write')
  @ApiOperation({ summary: 'Видалити користувача (Admin)' })
  @ApiResponse({ status: 200, description: 'Користувач видалений' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.usersService.delete(id, req.user, req.ip);
  }
}
