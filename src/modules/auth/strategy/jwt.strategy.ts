import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/modules/users/users.service';
import { UserStatus } from 'src/common/enum/user.status.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(
    payload: any,
  ): Promise<{ userId: string; email: string; role: string }> {
    // Validate payload structure
    if (!payload?.userId || !payload?.email || !payload?.role) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Fetch user from database
    const user = await this.usersService.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check user status with specific error messages
    switch (user.status) {
      case UserStatus.APPROVED:
        return {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
        };
      case UserStatus.PENDING:
        throw new UnauthorizedException('Account is pending approval');
      case UserStatus.REJECTED:
        throw new UnauthorizedException('Account has been rejected');
      case UserStatus.BLOCKED:
        throw new UnauthorizedException('Account is blocked');
      default:
        throw new UnauthorizedException('Invalid account status');
    }
  }
}
