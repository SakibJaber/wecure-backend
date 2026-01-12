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
    try {
      const result = await this.uploadsService.generateUploadUrl(
        body.mimeType,
        body.folder,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Presigned URL generated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to generate presigned URL',
        data: null,
      };
    }
  }

  /**
   * Request presigned view/download URL
   */
  @Get('view')
  async getPresignedViewUrl(@Query('key') key: string) {
    try {
      const url = await this.uploadsService.generateViewUrl(key);
      return {
        success: true,
        statusCode: 200,
        message: 'File view URL generated successfully',
        data: { url },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to generate file view URL',
        data: null,
      };
    }
  }
}
