import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeRoleDto } from './dto/change-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req) {
    try {
      const user = await this.usersService.findById(req.user.userId);
      return {
        success: true,
        statusCode: 200,
        message: 'User profile fetched successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch profile',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Req() req, @Body() dto: UpdateProfileDto) {
    try {
      const user = await this.usersService.updateProfile(req.user.userId, dto);
      return {
        success: true,
        statusCode: 200,
        message: 'Profile updated successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update profile',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    try {
      await this.usersService.changePassword(req.user.userId, dto);
      return {
        success: true,
        statusCode: 200,
        message: 'Password changed successfully',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to change password',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  async deleteAccount(@Req() req) {
    try {
      await this.usersService.deleteAccount(req.user.userId);
      return {
        success: true,
        statusCode: 200,
        message: 'Account deleted successfully',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete account',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query() query) {
    try {
      const result = await this.usersService.findAll(query);
      return {
        success: true,
        statusCode: 200,
        message: 'Users fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch users',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/block')
  async blockUser(@Param('id') id: string) {
    try {
      const user = await this.usersService.blockUser(id);
      return {
        success: true,
        statusCode: 200,
        message: 'User blocked successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to block user',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/unblock')
  async unblockUser(@Param('id') id: string) {
    try {
      const user = await this.usersService.unblockUser(id);
      return {
        success: true,
        statusCode: 200,
        message: 'User unblocked successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to unblock user',
        data: null,
      };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/role')
  async changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto) {
    try {
      const user = await this.usersService.changeRole(id, dto.role);
      return {
        success: true,
        statusCode: 200,
        message: 'User role updated successfully',
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update user role',
        data: null,
      };
    }
  }
}
