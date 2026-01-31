import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from 'src/common/enum/role.enum';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { Appointment } from 'src/modules/appointments/schemas/appointment.schema';

@Injectable()
export class AppointmentAccessGuard implements CanActivate {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<Appointment>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const appointmentId = request.params.id;

    if (!user || !appointmentId) {
      throw new ForbiddenException();
    }

    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Ownership check (doctor OR patient)
    const isPatient = appointment.userId.toString() === user.userId;
    const isDoctor = appointment.doctorId.toString() === user.doctorId;

    if (!isPatient && !isDoctor && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You do not have access to this appointment',
      );
    }

    // Time window check with 5-minute grace period
    const now = new Date();
    const start = this.combineDateTime(
      appointment.appointmentDate,
      appointment.appointmentTime,
    );
    const end = this.combineDateTime(
      appointment.appointmentDate,
      appointment.appointmentEndTime,
    );

    const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
    const startWithGrace = new Date(start.getTime() - gracePeriodMs);
    const endWithGrace = new Date(end.getTime() + gracePeriodMs);

    if (now < startWithGrace || now > endWithGrace) {
      throw new ForbiddenException('Outside appointment time window');
    }

    // Status check
    // Allow access if ONGOING OR if within grace period (UPCOMING/COMPLETED allowed in grace)
    if (appointment.status !== AppointmentStatus.ONGOING) {
      // If status is not ONGOING, we only allow if we are strictly within the grace period
      // effectively treating the grace period as a valid "active" time regardless of status label
      // However, if it's CANCELLED, we should probably still deny.
      if (appointment.status === AppointmentStatus.CANCELLED) {
        throw new ForbiddenException('Appointment is cancelled');
      }

      // If it's UPCOMING and we are in the early grace period -> Allow
      // If it's COMPLETED and we are in the late grace period -> Allow
      // The time window check above already ensures we are within [Start-5, End+5]
      // So if we passed that, we are good to go unless it's cancelled.
    }

    // Attach appointment for downstream use
    request.appointment = appointment;

    return true;
  }

  private combineDateTime(date: Date, time: string): Date {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  }
}
