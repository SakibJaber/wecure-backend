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
import { Doctor } from 'src/modules/doctors/schemas/doctor.schema';

@Injectable()
export class AppointmentAccessGuard implements CanActivate {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<Appointment>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<Doctor>,
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
    let isDoctor = false;

    if (user.role === Role.DOCTOR) {
      const doctorProfile = await this.doctorModel
        .findOne({ userId: user.userId })
        .lean();

      console.log('--- Appointment Access Debug ---');
      console.log('User ID from Token:', user.userId);
      console.log('Appointment Doctor ID:', appointment.doctorId.toString());
      if (doctorProfile) {
        console.log('Found Doctor Profile ID:', doctorProfile._id.toString());
      } else {
        console.log('No Doctor Profile found for this User ID');
      }

      if (
        doctorProfile &&
        appointment.doctorId.toString() === doctorProfile._id.toString()
      ) {
        isDoctor = true;
        console.log('Match Found: Access Granted for Doctor');
      } else {
        console.log('Match Failed: Access Denied for Doctor');
      }
      console.log('--------------------------------');
    }

    if (!isPatient && !isDoctor && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You do not have access to this appointment',
      );
    }

    // Differentiate between Chat and Video Call
    const isChatRequest = request.url.includes('/chat/token');

    // Chat access logic
    if (isChatRequest) {
      const allowedChatStatuses = [
        AppointmentStatus.UPCOMING,
        AppointmentStatus.ONGOING,
        AppointmentStatus.COMPLETED,
      ];

      if (!allowedChatStatuses.includes(appointment.status)) {
        throw new ForbiddenException(
          `Chat is not available for appointments with status: ${appointment.status}`,
        );
      }

      // If it's a chat request and status is allowed, pass the guard
      request.appointment = appointment;
      return true;
    }

    // Video call access logic (Time window check with 5-minute grace period)
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

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ForbiddenException('Appointment is cancelled');
    }

    if (appointment.status === AppointmentStatus.PENDING) {
      throw new ForbiddenException('Appointment is still pending');
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
