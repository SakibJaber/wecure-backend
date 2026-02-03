import { Global, Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { PrivateUploadService } from './private-upload.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Global()
@Module({
  imports: [AuditLogsModule],
  controllers: [UploadsController],
  providers: [UploadsService, PrivateUploadService],
  exports: [UploadsService, PrivateUploadService],
})
export class UploadsModule {}
