import { Controller, Post, Body, Get, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, LogoutDto, MeDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вхід користувача' })
  @ApiResponse({ status: 200, description: 'Успішний вхід' })
  @ApiResponse({ status: 401, description: 'Невірні облікові дані' })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Реєстрація нового користувача (Admin)' })
  @ApiResponse({ status: 201, description: 'Користувач створений' })
  @ApiResponse({ status: 409, description: 'Email вже існує' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Оновлення токенів' })
  @ApiResponse({ status: 200, description: 'Токени оновлено' })
  @ApiResponse({ status: 401, description: 'Невірний токен' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Вихід з системи' })
  @ApiResponse({ status: 200, description: 'Успішний вихід' })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Поточний користувач' })
  @ApiResponse({ status: 200, description: 'Дані користувача' })
  async me(@Req() req: any) {
    return req.user;
  }
}
