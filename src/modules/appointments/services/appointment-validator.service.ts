import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';
import { AvailabilityService } from '../../availability/availability.service';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';

@Injectable()
export class AppointmentValidatorService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async validateGeneralAvailability(
    doctorId: string,
    appointmentDate: Date,
    appointmentTime: string,
    appointmentEndTime: string,
    availabilities: any[],
  ) {
    // 1. Check if date is in the past
    const now = new Date();
    const apptDateTime = new Date(appointmentDate);
    const [h, m] = appointmentTime.split(':').map(Number);
    apptDateTime.setHours(h, m, 0, 0);

    if (apptDateTime < now) {
      throw new BadRequestException('Cannot book appointments in the past');
    }

    // 2. Get doctor availability
    if (!availabilities || availabilities.length === 0) {
      throw new BadRequestException('Doctor has no availability configured');
    }

    // 3. Check specific day
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const dayOfWeek = days[appointmentDate.getDay()];

    const dayAvailability = availabilities.find(
      (a) => a.dayOfWeek === dayOfWeek && a.isActive,
    );

    if (!dayAvailability) {
      throw new BadRequestException(`Doctor is not available on ${dayOfWeek}`);
    }

    // 4. Check time range
    const startMinutes = this.timeToMinutes(dayAvailability.startTime);
    const endMinutes = this.timeToMinutes(dayAvailability.endTime);
    const apptStartMinutes = this.timeToMinutes(appointmentTime);
    const apptEndMinutes = this.timeToMinutes(appointmentEndTime);

    if (apptStartMinutes < startMinutes || apptEndMinutes > endMinutes) {
      throw new BadRequestException(
        `Appointment time must be between ${dayAvailability.startTime} and ${dayAvailability.endTime}`,
      );
    }

    return dayAvailability;
  }

  async checkOverlap(
    doctorId: string,
    appointmentDate: Date,
    appointmentTime: string,
    appointmentEndTime: string,
    session: any,
  ) {
    // 5. Check for overlapping appointments using DB query
    const overlappingAppt = await this.appointmentModel
      .findOne({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: {
          $gte: new Date(new Date(appointmentDate).setHours(0, 0, 0, 0)),
          $lt: new Date(new Date(appointmentDate).setHours(23, 59, 59, 999)),
        },
        status: { $ne: AppointmentStatus.CANCELLED },
        appointmentTime: { $lt: appointmentEndTime },
        appointmentEndTime: { $gt: appointmentTime },
      })
      .select('appointmentTime appointmentEndTime')
      .session(session)
      .lean();

    if (overlappingAppt) {
      throw new BadRequestException(
        `This time slot overlaps with an existing appointment (${overlappingAppt.appointmentTime} - ${overlappingAppt.appointmentEndTime})`,
      );
    }
  }

  async getAvailableSlots(doctorId: string, date: Date) {
    // 1. Get doctor's availability for that day
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const dayOfWeek = days[date.getDay()];

    const availability = await this.availabilityService.getByDoctor(
      new Types.ObjectId(doctorId),
    );
    const dayAvailability = availability.find(
      (a) => a.dayOfWeek === dayOfWeek && a.isActive,
    );

    if (!dayAvailability) {
      return [];
    }

    // 2. Generate all possible slots
    const allSlots = this.availabilityService.generateSlots(
      dayAvailability.startTime,
      dayAvailability.endTime,
      dayAvailability.slotSizeMinutes,
    );

    // 3. Get existing appointments for that day
    const existingAppointments = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: {
          $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
          $lt: new Date(new Date(date).setHours(23, 59, 59, 999)),
        },
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentTime appointmentEndTime')
      .lean();

    const bookedAppointments = existingAppointments.map((a) => ({
      start: this.timeToMinutes(a.appointmentTime),
      end: this.timeToMinutes(a.appointmentEndTime || a.appointmentTime),
    }));

    // 4. Filter out booked slots and past slots (if today)
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return allSlots
      .filter((time) => {
        const slotStart = this.timeToMinutes(time);
        const slotEnd = slotStart + dayAvailability.slotSizeMinutes;

        if (isToday) {
          if (slotStart <= currentMinutes) {
            return false;
          }
        }

        // Check for overlap: S1 < E2 && E1 > S2
        const isOverlapping = bookedAppointments.some(
          (appt) => slotStart < appt.end && slotEnd > appt.start,
        );

        return !isOverlapping;
      })
      .map((time) => ({
        time,
        isAvailable: true,
        fee: dayAvailability.fee,
        duration: dayAvailability.slotSizeMinutes,
      }));
  }

  async getAvailableDates(doctorId: string, daysToLookAhead: number = 30) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + daysToLookAhead);

    // 1. Get doctor's availability
    const availabilities = await this.availabilityService.getByDoctor(
      new Types.ObjectId(doctorId),
    );

    if (!availabilities || availabilities.length === 0) {
      return [];
    }

    // 2. Normalize availability by Day of Week
    const availabilityMap = new Map();
    availabilities.forEach((a) => {
      if (a.isActive) {
        availabilityMap.set(a.dayOfWeek, a);
      }
    });

    // 3. Get all existing appointments in the range
    const appointments = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: {
          $gte: startDate,
          $lt: endDate,
        },
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentDate appointmentTime appointmentEndTime')
      .lean();

    // Map: 'YYYY-MM-DD' -> [{start, end}]
    const bookedMap = new Map<string, { start: number; end: number }[]>();
    appointments.forEach((appt) => {
      const dateStr = this.formatDate(appt.appointmentDate);
      if (!bookedMap.has(dateStr)) {
        bookedMap.set(dateStr, []);
      }
      bookedMap.get(dateStr)!.push({
        start: this.timeToMinutes(appt.appointmentTime),
        end: this.timeToMinutes(
          appt.appointmentEndTime || appt.appointmentTime,
        ),
      });
    });

    const results: any[] = [];
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];

    // 4. Iterate over each day
    const currentDate = new Date(startDate);
    while (currentDate < endDate) {
      const dayName = days[currentDate.getDay()];
      const dayAvailability = availabilityMap.get(dayName);

      if (dayAvailability) {
        const dateStr = this.formatDate(currentDate);

        // Calculate total possible slots
        const allSlots = this.availabilityService.generateSlots(
          dayAvailability.startTime,
          dayAvailability.endTime,
          dayAvailability.slotSizeMinutes,
        );

        const bookedAppts = bookedMap.get(dateStr) || [];

        // If today, filter out past slots from total available slots calculation
        const isToday =
          currentDate.getDate() === now.getDate() &&
          currentDate.getMonth() === now.getMonth() &&
          currentDate.getFullYear() === now.getFullYear();

        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const availableSlots = allSlots.filter((time) => {
          const slotStart = this.timeToMinutes(time);
          const slotEnd = slotStart + dayAvailability.slotSizeMinutes;

          if (isToday) {
            if (slotStart <= currentMinutes) {
              return false;
            }
          }

          // Check for overlap: S1 < E2 && E1 > S2
          const isOverlapping = bookedAppts.some(
            (appt) => slotStart < appt.end && slotEnd > appt.start,
          );

          return !isOverlapping;
        });

        const availableCount = availableSlots.length;

        if (availableCount > 0) {
          results.push({
            date: dateStr,
            day: dayName,
            availableSlots: availableCount,
            totalSlots: allSlots.length,
          });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
