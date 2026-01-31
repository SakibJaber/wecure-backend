import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';

@Injectable()
export class AppointmentSchedulerService {
  private readonly logger = new Logger(AppointmentSchedulerService.name);

  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAppointmentTransitions() {
    this.logger.debug('Running appointment status transition job...');

    const now = new Date();
    const currentTime = this.formatTime(now);

    // 1. Transition UPCOMING -> ONGOING
    // Criteria: Status is UPCOMING, Date is today or past, Time is reached
    // Note: We check date <= today to catch any missed from previous days (though unlikely with 1min cron)
    // Ideally, we check: (Date < Today) OR (Date == Today AND Time <= Now)

    // However, since we store date and time separately, we need to be careful.
    // Let's find appointments where:
    // - Status is UPCOMING
    // - Date is Today AND Time <= CurrentTime
    // OR
    // - Date is Before Today (should be marked ONGOING or maybe directly COMPLETED/MISSED?
    //   For now, let's stick to the requirement: UPCOMING -> ONGOING when start time is reached.
    //   If it's way past, it will eventually go to COMPLETED in the next step.

    // Find UPCOMING appointments that should be ONGOING
    // We need to query for:
    // (date < today) OR (date == today AND time <= currentTime)

    // To simplify, we can fetch candidates and filter in memory if volume is low,
    // or construct a complex query. Given it's a cron, a query is better.

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Update UPCOMING -> ONGOING
    const upcomingResult = await this.appointmentModel.updateMany(
      {
        status: AppointmentStatus.UPCOMING,
        $or: [
          { appointmentDate: { $lt: todayStart } }, // Past days
          {
            appointmentDate: { $gte: todayStart, $lte: todayEnd },
            appointmentTime: { $lte: currentTime },
          },
        ],
      },
      {
        $set: { status: AppointmentStatus.ONGOING },
      },
    );

    if (upcomingResult.modifiedCount > 0) {
      this.logger.log(
        `Transitioned ${upcomingResult.modifiedCount} appointments to ONGOING`,
      );
    }

    // 2. Transition ONGOING -> COMPLETED
    // Criteria: Status is ONGOING, EndTime has passed
    // (Date < Today) OR (Date == Today AND EndTime < CurrentTime)

    const ongoingResult = await this.appointmentModel.updateMany(
      {
        status: AppointmentStatus.ONGOING,
        $or: [
          { appointmentDate: { $lt: todayStart } }, // Past days
          {
            appointmentDate: { $gte: todayStart, $lte: todayEnd },
            appointmentEndTime: { $lt: currentTime },
          },
        ],
      },
      {
        $set: { status: AppointmentStatus.COMPLETED },
      },
    );

    if (ongoingResult.modifiedCount > 0) {
      this.logger.log(
        `Transitioned ${ongoingResult.modifiedCount} appointments to COMPLETED`,
      );
    }
  }

  private formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
