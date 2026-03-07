import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';
import {
  AppointmentAttachment,
  AttachmentDocument,
} from '../schemas/attachment.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { AppointmentValidatorService } from './appointment-validator.service';
import { AvailabilityService } from '../../availability/availability.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { AgoraService } from '../../agora/agora.service';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { AddAppointmentAttachmentDto } from '../dto/add-appointment-attachment.dto';
import { RejectAppointmentDto } from '../dto/reject-appointment.dto';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { RefundsService } from '../../refunds/refunds.service';

@Injectable()
export class AppointmentManagerService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentAttachment.name)
    private attachmentModel: Model<AttachmentDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    private readonly validatorService: AppointmentValidatorService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationsService: NotificationsService,
    private readonly encryptionService: EncryptionService,
    private readonly agoraService: AgoraService,
    private readonly refundsService: RefundsService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  generateAgoraToken(channelName: string, uid: string | number) {
    return this.agoraService.generateToken(channelName, uid);
  }

  generateAgoraChatToken(userUuid: string) {
    return this.agoraService.generateChatToken(userUuid);
  }

  // ---------------- Create Appointment ----------------
  async create(userId: string, dto: CreateAppointmentDto) {
    // 1. Parallelize initial reads outside transaction
    const [doctor, availabilities] = await Promise.all([
      this.doctorModel.findById(dto.doctorId).select('_id specialtyId').lean(),
      this.availabilityService.getByDoctor(new Types.ObjectId(dto.doctorId)),
    ]);

    if (!doctor) {
      throw new NotFoundException(
        'Doctor not found. Please provide a valid doctor profile ID, not user ID.',
      );
    }

    const endTime = this.calculateEndTime(
      dto.appointmentTime,
      30, // Default slot size
    );

    // 2. Validate general availability outside transaction
    const dayAvailability =
      await this.validatorService.validateGeneralAvailability(
        dto.doctorId,
        new Date(dto.appointmentDate),
        dto.appointmentTime,
        endTime,
        availabilities,
      );

    // 3. Start transaction only for overlap check and creation
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 4. Check for overlapping appointments (inside transaction)
      await this.validatorService.checkOverlap(
        dto.doctorId,
        new Date(dto.appointmentDate),
        dto.appointmentTime,
        endTime,
        session,
      );

      const appointment = await this.appointmentModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            doctorId: new Types.ObjectId(dto.doctorId),
            specialistId: doctor.specialtyId,
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            appointmentEndTime: endTime,
            reasonTitle: this.encryptionService.encrypt(dto.reasonTitle),
            reasonDetails: this.encryptionService.encrypt(dto.reasonDetails),
            consultationFee: dayAvailability.fee,
          },
        ],
        { session },
      );

      const newAppointment = appointment[0] as any;

      // If attachments were provided, update them to point to this appointment
      if (dto.attachmentIds?.length) {
        await this.attachmentModel.updateMany(
          {
            _id: { $in: dto.attachmentIds.map((id) => new Types.ObjectId(id)) },
          },
          { appointmentId: newAppointment._id },
          { session },
        );
      }

      await session.commitTransaction();

      return appointment[0];
    } catch (e) {
      await session.abortTransaction();
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as any).code === 11000
      ) {
        throw new BadRequestException('This time slot is already booked');
      }
      throw e;
    } finally {
      session.endSession();
    }
  }

  // ---------------- Approval Actions ----------------
  async rejectAppointment(
    appointmentId: string,
    userId: string,
    dto?: RejectAppointmentDto,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException('Appointment not found');

    // Look up doctor profile from userId
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    // Verify doctor owns this appointment
    if (appointment.doctorId.toString() !== doctor._id.toString()) {
      throw new ForbiddenException(
        'You can only reject appointments assigned to you',
      );
    }

    // Check if already in terminal state
    if (
      [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(
        appointment.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot reject appointment that is already ${appointment.status}`,
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    const updatedAppointment = await appointment.save();

    // Trigger Refund (Full Refund for Doctor Rejection)
    if (appointment.paymentId) {
      await this.refundsService.processFullRefund(
        appointment._id.toString(),
        appointment,
        userId,
      );
    }

    this.notificationsService.emit('appointment.rejected', {
      appointmentId: appointment._id,
      userId: appointment.userId,
      doctorId: appointment.doctorId,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      reason: dto?.reason,
    });

    return updatedAppointment;
  }

  // ---------------- Status Updates ----------------
  async updateStatus(
    appointmentId: string,
    requesterId: string,
    role: string,
    status: AppointmentStatus,
    doctorId?: string,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException();

    if (role === 'USER') {
      if (appointment.userId.toString() !== requesterId) {
        throw new ForbiddenException();
      }
    } else if (role === 'DOCTOR') {
      if (doctorId) {
        if (appointment.doctorId.toString() !== doctorId) {
          throw new ForbiddenException();
        }
      } else {
        // For doctors, requesterId is userId, need to lookup doctor profile
        const doctor = await this.doctorModel
          .findOne({ userId: requesterId })
          .lean();
        if (
          !doctor ||
          appointment.doctorId.toString() !== doctor._id.toString()
        ) {
          throw new ForbiddenException();
        }
      }
    } else {
      throw new ForbiddenException();
    }

    // Prevent updating if already in a terminal state
    if (
      [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(
        appointment.status,
      )
    ) {
      throw new BadRequestException(
        `Appointment is already ${appointment.status} and cannot be updated.`,
      );
    }

    const oldStatus = appointment.status;
    appointment.status = status;
    const updatedAppointment = await appointment.save();

    // Trigger Refund if Cancellation by Patient
    if (
      status === AppointmentStatus.CANCELLED &&
      role === 'USER' &&
      appointment.paymentId
    ) {
      await this.refundsService.processPartialRefund(
        appointment._id.toString(),
        appointment,
        requesterId,
      );
    }

    this.notificationsService.emit('appointment.status_change', {
      appointmentId: appointment._id,
      status,
      oldStatus,
      userId: appointment.userId,
      doctorId: appointment.doctorId,
    });

    return updatedAppointment;
  }

  async cancelUpcomingForDoctor(doctorId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.appointmentModel.updateMany(
      {
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: today },
        status: {
          $nin: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
        },
      },
      { status: AppointmentStatus.CANCELLED },
    );
  }

  // ---------------- Attachments ----------------
  async createAttachmentInfo(userId: string, dto: AddAppointmentAttachmentDto) {
    return this.attachmentModel.create({
      fileKey: dto.fileKey,
      fileType: dto.fileType,
      uploadedBy: new Types.ObjectId(userId),
    });
  }

  async addAttachment(
    appointmentId: string,
    requesterId: string,
    role: string,
    dto: AddAppointmentAttachmentDto,
    doctorId?: string,
  ) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundException();

    const isPatient = appointment.userId.toString() === requesterId;

    let isDoctor = false;
    if (doctorId) {
      isDoctor = appointment.doctorId.toString() === doctorId;
    } else {
      // For doctors, requesterId is userId, need to lookup doctor profile
      const doctor = await this.doctorModel
        .findOne({ userId: requesterId })
        .lean();
      isDoctor = !!(
        doctor && appointment.doctorId.toString() === doctor._id.toString()
      );
    }

    if (!isPatient && !isDoctor) {
      throw new ForbiddenException();
    }

    return this.attachmentModel.create({
      appointmentId: new Types.ObjectId(appointmentId),
      fileKey: dto.fileKey,
      fileType: dto.fileType,
      uploadedBy: new Types.ObjectId(requesterId),
    });
  }

  async markAsPaid(appointmentId: string, paymentId: string) {
    const appointment = await this.appointmentModel.findByIdAndUpdate(
      appointmentId,
      {
        paymentId: new Types.ObjectId(paymentId),
        status: AppointmentStatus.UPCOMING,
      },
      { new: true },
    );

    if (appointment) {
      this.notificationsService.emit('appointment.created', appointment);
    }

    return appointment;
  }

  // ---------------- Helpers ----------------
  private calculateEndTime(startTime: string, slotMinutes: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + slotMinutes;
    const endH = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const endM = (total % 60).toString().padStart(2, '0');
    return `${endH}:${endM}`;
  }
}
