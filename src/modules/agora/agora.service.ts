import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

@Injectable()
export class AgoraService {
  private appId: string;
  private appCertificate: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate =
      this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';

    if (!this.appId || !this.appCertificate) {
      console.warn('Agora credentials not found in environment variables');
    }
  }

  generateToken(channelName: string, uid: string | number) {
    if (!this.appId || !this.appCertificate) {
      throw new InternalServerErrorException('Agora configuration missing');
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 300; // 5 minutes
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    try {
      let token: string;
      if (typeof uid === 'number') {
        token = RtcTokenBuilder.buildTokenWithUid(
          this.appId,
          this.appCertificate,
          channelName,
          uid,
          role,
          expirationTimeInSeconds,
          expirationTimeInSeconds,
        );
      } else {
        token = RtcTokenBuilder.buildTokenWithUserAccount(
          this.appId,
          this.appCertificate,
          channelName,
          uid,
          role,
          expirationTimeInSeconds,
          expirationTimeInSeconds,
        );
      }

      return {
        appId: this.appId,
        channel: channelName,
        token,
      };
    } catch (error) {
      console.error('Agora token generation error:', error);
      throw new InternalServerErrorException('Failed to generate Agora token');
    }
  }
}
