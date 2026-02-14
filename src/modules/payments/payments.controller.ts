import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
  Headers,
  Logger,
  ForbiddenException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { AppointmentFinderService } from '../appointments/services/appointment-finder.service';
import { AppointmentManagerService } from '../appointments/services/appointment-manager.service';
import { DonationsService } from '../donations/donations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PayoutManagerService } from '../payouts/services/payout-manager.service';
import { RefundsService } from '../refunds/refunds.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paystackService: PaystackService,
    private readonly appointmentFinderService: AppointmentFinderService,
    private readonly appointmentManagerService: AppointmentManagerService,
    private readonly donationsService: DonationsService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly payoutManagerService: PayoutManagerService,
    private readonly refundsService: RefundsService,
  ) {}

  @Post('appointments/:appointmentId/initialize')
  @UseGuards(JwtAuthGuard)
  async initializeAppointmentPayment(
    @Param('appointmentId') appointmentId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    // 1. Get Appointment
    const appointment =
      await this.appointmentFinderService.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // 2. Ensure caller is patient
    if (appointment.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only pay for your own appointments',
      );
    }

    // 3. Ensure status is PENDING
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Appointment is not in PENDING status');
    }

    // 4. Ensure not already paid
    if (appointment.paymentId) {
      throw new BadRequestException('Appointment is already paid');
    }

    // 5. Get fee
    const amount = appointment.consultationFee;
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid consultation fee');
    }

    // 6. Call Paystack
    const metadata = {
      type: 'APPOINTMENT',
      appointmentId,
      userId,
      doctorId: appointment.doctorId.toString(),
    };

    const paymentData = await this.paystackService.initializeTransaction(
      req.user.email, // Assuming email is in user object from JWT or we need to fetch user
      amount,
      metadata,
    );

    // Create a pending payment record
    await this.paymentsService.create({
      appointmentId,
      userId,
      paystackReference: paymentData.reference,
      amount,
      currency: 'NGN', // Configurable, but defaulting to NGN as per schema default
      status: 'PENDING',
    });

    return {
      authorization_url: paymentData.authorization_url,
      reference: paymentData.reference,
    };
  }

  @Post('donations/initialize')
  // Auth optional as per requirement "Auth optional"
  async initializeDonation(
    @Body() body: { email: string; amount: number; userId?: string },
  ) {
    if (!body.email || !body.amount) {
      throw new BadRequestException('Email and amount are required');
    }

    const metadata = {
      type: 'DONATION',
      userId: body.userId, // Optional
    };

    const paymentData = await this.paystackService.initializeTransaction(
      body.email,
      body.amount,
      metadata,
    );

    // Create donation record
    await this.donationsService.create({
      userId: body.userId, 
      paystackReference: paymentData.reference,
      amount: body.amount,
      currency: 'NGN',
      status: 'PENDING',
    } as any);

    return {
      authorization_url: paymentData.authorization_url,
      reference: paymentData.reference,
    };
  }

  @Post('webhook/paystack')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
  ) {
    this.logger.log('Incoming Paystack Webhook');
    this.logger.debug(`Signature: ${signature}`);
    this.logger.debug(`Body: ${JSON.stringify(body)}`);

    // 1. Verify Signature
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      this.logger.error('Invalid Paystack signature');
      this.logger.error(`Calculated Hash: ${hash}`);
      this.logger.error(`Expected Signature: ${signature}`);
      throw new ForbiddenException('Invalid signature');
    }

    this.logger.log(`Handling Paystack event: ${body.event}`);

    // 2. Handle charge.success
    if (body.event === 'charge.success') {
      const { reference, metadata } = body.data;
      this.logger.log(`Processing charge.success for reference: ${reference}`);

      // Idempotency check handled by checking current status

      if (metadata?.type === 'APPOINTMENT') {
        const payment = await this.paymentsService.findByReference(reference);
        if (payment && payment.status !== 'PAID') {
          // Update Payment
          await this.paymentsService.updateStatus(reference, 'PAID');

          // Update Appointment
          if (metadata.appointmentId) {
            // We need payment._id to link to appointment
            // payment object from findByReference has _id
            await this.appointmentManagerService.markAsPaid(
              metadata.appointmentId,
              payment._id.toString(),
            );
          }

          // Log Audit
          await this.auditLogsService.create({
            userId: metadata.userId,
            action: 'PAYMENT_SUCCESS',
            resource: 'Appointment',
            resourceId: metadata.appointmentId,
            ipAddress: body.data.ip_address,
          });
        }
      } else if (metadata?.type === 'DONATION') {
        const donation = await this.donationsService.findByReference(reference);
        if (donation && donation.status !== 'PAID') {
          // Update Donation
          donation.status = 'PAID';
          await donation.save();

          // Log Audit
          await this.auditLogsService.create({
            userId: metadata.userId || 'ANONYMOUS',
            action: 'DONATION_SUCCESS',
            resource: 'Donation',
            resourceId: donation._id.toString(),
            ipAddress: body.data.ip_address,
          });
        }
      }
    } else if (body.event === 'transfer.success') {
      const { reference } = body.data; // paystackTransferId
      await this.payoutManagerService.completePayoutFromWebhook(reference);
    } else if (body.event === 'transfer.failed') {
      // Handle transfer failure? PayoutsService didn't implement explicit failure handler but we can log
      this.logger.error(
        `Transfer failed for reference ${body.data.reference}: ${body.data.reason}`,
      );
      // Ideally update payout status to FAILED.
      // I should expose a method in PayoutsService for this. for now just log.
    } else if (body.event === 'refund.processed') {
      // Refund successful
      await this.refundsService.handleRefundWebhook(body.data);
    }

    return { status: 'success' };
  }
}
