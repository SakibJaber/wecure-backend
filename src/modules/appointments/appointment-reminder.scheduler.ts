import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentReminderScheduler {
  private readonly logger = new Logger(AppointmentReminderScheduler.name);

  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
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

    this.logger.log(`Sent ${sixHourAppointments.length} 6-hour reminders`);

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

    this.logger.log(`Sent ${oneHourAppointments.length} 1-hour reminders`);
  }

  private async findAppointmentsInWindow(
    windowStart: Date,
    windowEnd: Date,
    reminderFlag: 'reminder6hSent' | 'reminder1hSent',
  ) {
    // We need to combine date and time for accurate comparison
    // Since appointmentTime is stored as HH:mm string, we'll query by date range
    // and then filter by time in memory for accuracy

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
