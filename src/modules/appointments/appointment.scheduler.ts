import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentSchedulerService {
  private readonly logger = new Logger(AppointmentSchedulerService.name);

  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleAppointmentTransitions() {
    this.logger.debug('Running appointment status transition job...');

    const now = new Date();
    const currentTime = this.formatTime(now);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Transition UPCOMING -> ONGOING
    // Criteria: Status is UPCOMING, Date is in the past OR (Date is today AND Time is reached)
    const upcomingResult = await this.appointmentModel.updateMany(
      {
        status: AppointmentStatus.UPCOMING,
        $or: [
          { appointmentDate: { $lt: todayStart } },
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
    // Criteria: Status is ONGOING, Date is in the past OR (Date is today AND EndTime has passed)
    const ongoingResult = await this.appointmentModel.updateMany(
      {
        status: AppointmentStatus.ONGOING,
        $or: [
          { appointmentDate: { $lt: todayStart } },
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

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleReminders() {
    this.logger.log('Running appointment reminder check...');

    const now = new Date();

    // 6 hours from now
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const sixHoursWindow = new Date(sixHoursLater.getTime() + 10 * 60 * 1000); // +10 min window

    // 1 hour from now
    const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const oneHourWindow = new Date(oneHourLater.getTime() + 10 * 60 * 1000); // +10 min window

    // Find appointments for 6h reminder
    const sixHourAppointments = await this.findAppointmentsInWindow(
      sixHoursLater,
      sixHoursWindow,
      'reminder6hSent',
    );

    for (const appointment of sixHourAppointments) {
      this.notificationsService.emit('appointment.reminder', {
        appointment,
        type: '6H',
      });

      await this.appointmentModel.findByIdAndUpdate(appointment._id, {
        reminder6hSent: true,
      });
    }

    if (sixHourAppointments.length > 0) {
      this.logger.log(`Sent ${sixHourAppointments.length} 6-hour reminders`);
    }

    // Find appointments for 1h reminder
    const oneHourAppointments = await this.findAppointmentsInWindow(
      oneHourLater,
      oneHourWindow,
      'reminder1hSent',
    );

    for (const appointment of oneHourAppointments) {
      this.notificationsService.emit('appointment.reminder', {
        appointment,
        type: '1H',
      });

      await this.appointmentModel.findByIdAndUpdate(appointment._id, {
        reminder1hSent: true,
      });
    }

    if (oneHourAppointments.length > 0) {
      this.logger.log(`Sent ${oneHourAppointments.length} 1-hour reminders`);
    }
  }

  private async findAppointmentsInWindow(
    windowStart: Date,
    windowEnd: Date,
    reminderFlag: 'reminder6hSent' | 'reminder1hSent',
  ) {
    const startDate = new Date(windowStart);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(windowEnd);
    endDate.setHours(23, 59, 59, 999);

    const appointments = await this.appointmentModel
      .find({
        appointmentDate: { $gte: startDate, $lte: endDate },
        status: { $in: [AppointmentStatus.UPCOMING] },
        [reminderFlag]: false,
      })
      .populate('userId', 'name email')
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email' },
      })
      .lean();

    // Filter by actual datetime
    return appointments.filter((apt) => {
      const [hours, minutes] = apt.appointmentTime.split(':').map(Number);
      const aptDateTime = new Date(apt.appointmentDate);
      aptDateTime.setHours(hours, minutes, 0, 0);

      return aptDateTime >= windowStart && aptDateTime <= windowEnd;
    });
  }
}

