import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadsService {
  private s3: S3Client;
  private bucket: string;
  private signedUrlExpireSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('region'),
      credentials: {
        accessKeyId: this.configService.get<string>('accessKeyId')!,
        secretAccessKey: this.configService.get<string>('secretAccessKey')!,
      },
    });

    this.bucket = this.configService.get<string>('s3.bucketName')!;
    this.signedUrlExpireSeconds =
      this.configService.get<number>('s3.signedUrlExpireSeconds') || 300;
  }

  /**
   * Generate presigned URL for upload
   */
  async generateUploadUrl(
    mimeType: string,
    folder: 'appointments' | 'verifications' | 'profiles',
  ) {
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      throw new BadRequestException('Unsupported file type');
    }

    const fileKey = `${folder}/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: mimeType,
      ACL: 'private',
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.signedUrlExpireSeconds,
    });

    return {
      uploadUrl,
      fileKey,
    };
  }

  /**
   * Generate presigned URL for download (view)
   */
  async generateViewUrl(fileKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: this.signedUrlExpireSeconds,
    });
  }
}
