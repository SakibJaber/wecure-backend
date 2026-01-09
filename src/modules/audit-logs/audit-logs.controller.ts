import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
// import { Roles } from '../../common/decorators/roles.decorator';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('admin/audit-logs')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('ADMIN')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Get audit logs (paginated & filterable)
   */
  @Get()
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.auditLogsService.findAll({
      userId,
      action,
      from,
      to,
      page: Number(page),
      limit: Number(limit),
    });
  }
}
