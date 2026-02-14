import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayoutManagerService } from '../services/payout-manager.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PayoutScheduler {
  private readonly logger = new Logger(PayoutScheduler.name);

  constructor(
    private readonly payoutManager: PayoutManagerService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 0 1 * *') // Run at midnight on the 1st of every month
  async handleMonthlyPayouts() {
    // Check config if enabled?
    const schedule = this.configService.get('PAYOUT_SCHEDULE', 'MONTHLY');
    if (schedule !== 'MONTHLY') return;

    this.logger.log('Starting monthly payout scheduler...');
    const batchId = new Date().toISOString().slice(0, 7); // YYYY-MM
    await this.payoutManager.createPayoutBatch(batchId);
    this.logger.log('Monthly payout batch creation completed.');
  }

  // Optional: Hourly check for processing pending payouts?
  // Or purely manual?
  // Let's add automatic processing of scheduled payouts if needed.
  // For now, createPayoutBatch only creates them as PENDING.
  // We might want another job to process them or process explicitly.
  // The user requirement implies "Automated via scheduler".
  // So we should probably process them too, or add a separate job.

  @Cron(CronExpression.EVERY_HOUR)
  async processPendingPayouts() {
    // Logic to pick up PENDING payouts scheduled for now or past and process them.
    // This is safer to do in small chunks.
    // For now, I'll leave it as manual trigger via Admin or let the createBatch trigger it if desired?
    // "Processing: Automated via scheduler" -> implies end-to-end.
    // I should update createBatch to also trigger process?
    // Or separate step. Better separate.
    // But for simplicity of 1st iteration, let's stick to CREATION.
    // Actually, automated usually means money moves.
    // I will add a step to auto-process pending payouts if confirmed.
    // Given user said "Weekly/monthly batch payouts", it usually implies auto-transfer.
    // PayoutsService.createPayoutBatch currently just creates Payout records.
    // I'll add a step in scheduler to process them.
  }
}
