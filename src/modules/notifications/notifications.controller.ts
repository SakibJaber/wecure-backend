import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  @Post('test-push')
  async testPushNotification(
    @Request() req,
    @Body() body: { title: string; body: string; data?: any },
  ) {
    await this.pushService.sendToUser(
      req.user.userId,
      body.title || 'Test Notification',
      body.body || 'This is a test push notification from the backend.',
      body.data || { testKey: 'testValue' },
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Push notification triggered successfully',
    };
  }

  @Get()
  async getUserNotifications(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.notificationsService.getUserNotifications(
      req.user.userId,
      page,
      limit,
    );
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.userId, id);
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}
