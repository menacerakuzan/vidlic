import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../shared/prisma.service';
import { RedisService } from '../../shared/redis.service';
import { LoginDto, RegisterDto, RefreshTokenDto, LogoutDto } from './dto/auth.dto';
import { UserResponse } from './interfaces/auth.interface';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
    private auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: UserResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { department: true, position: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Невірні облікові дані');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Невірні облікові дані');
    }

    const tokens = await this.generateTokens(user);
    await this.createSession(user.id, tokens.refreshToken, ipAddress, userAgent);

    await this.auditService.log({
      userId: user.id,
      action: AuditAction.login,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      ...tokens,
      user: this.mapUserToResponse(user),
    };
  }

  async register(dto: RegisterDto): Promise<UserResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Користувач з таким email вже існує');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        employeeId: dto.employeeId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        patronymic: dto.patronymic,
        passwordHash,
        role: dto.role || 'specialist',
        departmentId: dto.departmentId,
        positionId: dto.positionId,
      },
      include: { department: true, position: true },
    });

    return this.mapUserToResponse(user);
  }

  async refreshToken(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'vidlik-refresh-secret',
      });

      const isRevoked = await this.redisService.get(`revoked:${payload.jti}`);
      if (isRevoked) {
        throw new UnauthorizedException('Токен відкликано');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { department: true, position: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Користувач не знайдено або неактивний');
      }

      await this.redisService.set(`revoked:${payload.jti}`, '1', 60 * 60 * 24 * 7);

      const tokens = await this.generateTokens(user);
      await this.createSession(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Невірний refresh токен');
    }
  }

  async logout(dto: LogoutDto): Promise<void> {
    try {
      const payload = this.jwtService.verify(dto.accessToken, {
        secret: process.env.JWT_SECRET,
        ignoreExpiration: true,
      });
      
      await this.redisService.set(`revoked:${payload.jti}`, '1', 60 * 60 * 24 * 7);
      
      await this.prisma.session.deleteMany({
        where: { tokenJti: payload.jti },
      });
    } catch {
      // Token invalid or expired, ignore
    }
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, position: true },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return this.mapUserToResponse(user);
  }

  async validateAccessToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'vidlik-secret-key-change-in-prod',
      }) as any;

      const isRevoked = await this.redisService.get(`revoked:${payload.jti}`);
      if (isRevoked) return null;

      const user = await this.validateUser(payload.sub);
      if (!user) return null;

      return {
        payload,
        user,
      };
    } catch {
      return null;
    }
  }

  private async generateTokens(user: any) {
    const jti = uuidv4();
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      scopeDepartmentIds: Array.isArray(user.scopeDepartmentIds) ? user.scopeDepartmentIds : [],
      jti,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'vidlik-refresh-secret',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async createSession(userId: string, refreshToken: string, ipAddress?: string, userAgent?: string) {
    const payload = this.jwtService.verify(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET || 'vidlik-refresh-secret',
    });

    await this.prisma.session.create({
      data: {
        userId,
        tokenJti: payload.jti,
        expiresAt: new Date(payload.exp * 1000),
        deviceInfo: userAgent,
        ipAddress,
      },
    });
  }

  private mapUserToResponse(user: any): UserResponse {
    return {
      id: user.id,
      email: user.email,
      employeeId: user.employeeId,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      role: user.role,
      departmentId: user.departmentId,
      scopeDepartmentIds: Array.isArray(user.scopeDepartmentIds) ? user.scopeDepartmentIds : [],
      department: user.department ? {
        id: user.department.id,
        name: user.department.name,
        nameUk: user.department.nameUk,
        code: user.department.code,
      } : null,
      position: user.position ? {
        id: user.position.id,
        title: user.position.title,
        titleUk: user.position.titleUk,
      } : null,
    };
  }
}
