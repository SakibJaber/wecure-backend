import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Request presigned upload URL
   */
  @Post('presign')
  async createPresignedUploadUrl(
    @Body()
    body: {
      mimeType: string;
      folder: 'appointments' | 'verifications';
    },
  ) {
    return this.uploadsService.generateUploadUrl(
      body.mimeType,
      body.folder,
    );
  }

  /**
   * Request presigned view/download URL
   */
  @Get('view')
  async getPresignedViewUrl(@Query('key') key: string) {
    return {
      url: await this.uploadsService.generateViewUrl(key),
    };
  }
}
