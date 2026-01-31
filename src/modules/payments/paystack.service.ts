import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY is not defined in environment variables',
      );
    }
  }

  async initializeTransaction(email: string, amount: number, metadata: any) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email,
            amount: amount * 100, // Convert to kobo/smallest unit
            metadata,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        'Error initializing Paystack transaction',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Payment initialization failed');
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        ),
      );
      const data = response.data.data;

      if (data.status === 'success') {
        this.notificationsService.emit('payment.success', {
          userId: data.metadata?.userId, // Assuming metadata has userId
          amount: data.amount / 100,
          reference: data.reference,
          metadata: data.metadata,
        });
      }

      return data;
    } catch (error) {
      this.logger.error(
        `Error verifying Paystack transaction: ${reference}`,
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Payment verification failed');
    }
  }
}
