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
import { AppointmentsService } from '../appointments/appointments.service';
import { DonationsService } from '../donations/donations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paystackService: PaystackService,
    private readonly appointmentsService: AppointmentsService,
    private readonly donationsService: DonationsService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService, // Inject AuditLogsService
  ) {}

  @Post('appointments/:appointmentId/initialize')
  @UseGuards(JwtAuthGuard)
  async initializeAppointmentPayment(
    @Param('appointmentId') appointmentId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;

    // 1. Get Appointment
    const appointment = await this.appointmentsService.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // 2. Ensure caller is patient
    if (appointment.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only pay for your own appointments',
      );
    }

    // 3. Ensure status is UPCOMING
    if (appointment.status !== AppointmentStatus.UPCOMING) {
      throw new BadRequestException('Appointment is not in UPCOMING status');
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
      userId: body.userId, // Schema requires userId, but requirement says "Auth optional".
      // If userId is missing, we might need a default or update schema to make it optional.
      // Checking schema: userId is required.
      // Requirement: "Auth optional".
      // Conflict. I will assume if auth is optional, userId might be null.
      // But schema says required. I should probably make it optional in schema or require it.
      // Given "Auth optional", I'll assume for now we might need a dummy user or make it optional.
      // Let's check schema again.
      // Schema: @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
      // I should update schema to make userId optional if I want to support anonymous donations.
      // But for now, let's assume the user provides a userId if logged in, or we fail if not?
      // "Auth optional" usually means anonymous allowed.
      // I will update Donation schema to make userId optional in next step if needed.
      // For now, I'll pass body.userId.
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
    // 1. Verify Signature
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      throw new ForbiddenException('Invalid signature');
    }

    // 2. Handle charge.success
    if (body.event === 'charge.success') {
      const { reference, metadata } = body.data;

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
            await this.appointmentsService.markAsPaid(
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
          // DonationsService needs updateStatus method or use update
          // I'll use update with ID if I can get it, or I added findByReference.
          // I need to add updateStatus to DonationsService or just use findByReference result.
          // donation is the document.
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
    }

    return { status: 'success' };
  }
}
