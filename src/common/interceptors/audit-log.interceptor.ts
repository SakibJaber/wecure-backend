import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { AuditLogsService } from 'src/modules/audit-logs/audit-logs.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();

    const user = request['user']; // set by auth guard
    const method = request.method;
    const path = request.route?.path || request.url;
    let ip =
      request.headers['x-forwarded-for']?.toString() ||
      request.socket.remoteAddress;

    if (ip === '::1') {
      ip = '127.0.0.1';
    }

    // Sanitize body to remove sensitive fields like password
    const sanitizedBody = { ...request.body };
    delete sanitizedBody.password;
    delete sanitizedBody.oldPassword;
    delete sanitizedBody.newPassword;

    return next.handle().pipe(
      tap(async () => {
        // Only log authenticated & meaningful actions
        if (!user) return;

        await this.auditLogsService.create({
          userId: user.userId,
          action: `${method} ${path}`,
          resource: path,
          resourceId: request.params?.id || undefined,
          ipAddress: ip,
          // We could also add sanitizedBody here if we update the AuditLog schema
        });
      }),
    );
  }
}
