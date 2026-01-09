import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: 'USER' | 'DOCTOR';
  }) {
    const user = await this.usersService.createUser(data);
    return this.generateToken(user._id.toString(), user.role);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account blocked');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    return this.generateToken(user._id.toString(), user.role);
  }

  private generateToken(userId: string, role: string) {
    return {
      accessToken: this.jwtService.sign({ userId, role }),
    };
  }
}
