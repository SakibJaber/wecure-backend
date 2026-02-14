import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payout, PayoutDocument, PayoutStatus } from '../schemas/payout.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../appointments/schemas/appointment.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { PaystackService } from '../../payments/paystack.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PayoutHelperService } from '../helpers/payout.helper';

@Injectable()
export class PayoutManagerService {
  private readonly logger = new Logger(PayoutManagerService.name);

  constructor(
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly paystackService: PaystackService,
    private readonly auditLogsService: AuditLogsService,
    private readonly payoutHelper: PayoutHelperService,
  ) {}

  /**
   * Create payout batch for ALL eligible doctors (Monthly Scheduler)
   */
  async createPayoutBatch(batchId: string) {
    this.logger.log(`Starting payout batch ${batchId}`);

    const results = await this.appointmentModel.aggregate(
      this.payoutHelper.getPendingEarningsAggregation(),
    );
    this.logger.log(`Found ${results.length} doctors eligible for payout`);

    const payouts: Payout[] = [];

    for (const result of results) {
      const doctorId = result._id;

      try {
        const { platformCommission, payoutAmount } =
          this.payoutHelper.calculatePayoutAmount(result.totalEarnings);

        // Ensure Recipient
        const recipientCode = await this.ensureTransferRecipient(
          doctorId.toString(),
        );

        if (!recipientCode) {
          this.logger.warn(
            `Skipping payout for doctor ${doctorId}: No valid bank details/recipient`,
          );
          continue;
        }

        // Create Payout
        const payout = new this.payoutModel({
          doctorId: doctorId,
          batchId,
          appointmentIds: result.appointmentIds,
          totalEarnings: result.totalEarnings,
          platformCommission,
          payoutAmount,
          transferRecipientCode: recipientCode,
          status: PayoutStatus.PENDING,
          scheduledFor: new Date(),
        });

        await payout.save();
        payouts.push(payout);

        // Lock appointments
        await this.appointmentModel.updateMany(
          { _id: { $in: result.appointmentIds } },
          { payoutId: payout._id },
        );
      } catch (error) {
        this.logger.error(
          `Error creating payout for doctor ${doctorId}`,
          error,
        );
      }
    }

    return payouts;
  }

  /**
   * Process a payout (Initiate Transfer)
   */
  async processPayout(payoutId: string) {
    const payout = await this.payoutModel.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout not found');

    if (
      payout.status !== PayoutStatus.PENDING &&
      payout.status !== PayoutStatus.FAILED
    ) {
      throw new BadRequestException(`Payout is already ${payout.status}`);
    }

    payout.status = PayoutStatus.PROCESSING;
    await payout.save();

    try {
      const transfer = await this.paystackService.initiateTransfer(
        payout.transferRecipientCode,
        payout.payoutAmount,
        `Payout Batch ${payout.batchId}`,
        payout.doctorId.toString(),
      );

      payout.paystackTransferId = transfer.reference || transfer.code;
      payout.processedAt = new Date();
      payout.metadata = transfer;

      await payout.save();
      return payout;
    } catch (error) {
      payout.status = PayoutStatus.FAILED;
      payout.failureReason = error.message;
      payout.retryCount = (payout.retryCount || 0) + 1;
      await payout.save();
      this.logger.error(`Payout processing failed for ${payoutId}`, error);
      return payout;
    }
  }

  /**
   * Ensure Doctor has a Paystack Transfer Recipient
   */
  async ensureTransferRecipient(doctorDocId: string): Promise<string | null> {
    const doctor = await this.doctorModel.findById(doctorDocId);
    if (!doctor) return null;

    if (doctor.paystackRecipientCode) {
      return doctor.paystackRecipientCode;
    }

    const { bankName, accountName, accountNumber } =
      this.payoutHelper.decryptBankDetails(doctor);

    if (!accountNumber || !accountName || !bankName) {
      return null;
    }

    const banks = await this.paystackService.listBanks();

    const bank = banks.find(
      (b) =>
        b.name.toLowerCase() === bankName.toLowerCase() ||
        b.slug.toLowerCase() === bankName.toLowerCase(),
    );

    if (!bank) {
      this.logger.warn(`Bank not found for doctor ${doctorDocId}: ${bankName}`);
      return null;
    }

    try {
      const recipient = await this.paystackService.createTransferRecipient(
        accountName,
        accountNumber,
        bank.code,
      );

      doctor.paystackRecipientCode = recipient.recipient_code;
      doctor.recipientCreatedAt = new Date();
      await doctor.save();

      return recipient.recipient_code;
    } catch (e) {
      this.logger.error(
        `Failed to create recipient for doctor ${doctorDocId}`,
        e,
      );
      return null;
    }
  }

  /**
   * Complete payout from Paystack Webhook
   */
  async completePayoutFromWebhook(transferCode: string) {
    const payout = await this.payoutModel.findOne({
      paystackTransferId: transferCode,
    });
    if (!payout) return;

    if (payout.status === PayoutStatus.COMPLETED) return;

    payout.status = PayoutStatus.COMPLETED;
    await payout.save();

    // Mark appointments as paid out
    await this.appointmentModel.updateMany(
      { _id: { $in: payout.appointmentIds } },
      {
        isPaidOut: true,
        paidOutAt: new Date(),
        payoutAmount: 0, // Placeholder
      },
    );

    // Update doctor stats
    await this.doctorModel.findByIdAndUpdate(payout.doctorId, {
      $inc: {
        totalPayouts: payout.payoutAmount,
      },
    });
  }
}
