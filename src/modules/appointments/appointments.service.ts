import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import {
  AppointmentAttachment,
  AttachmentDocument,
} from './schemas/attachment.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { AvailabilityService } from '../availability/availability.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AddAppointmentAttachmentDto } from './dto/add-appointment-attachment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,

    @InjectModel(AppointmentAttachment.name)
    private attachmentModel: Model<AttachmentDocument>,

    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,

    private readonly availabilityService: AvailabilityService,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ---------------- Create Appointment ----------------
  async create(userId: string, dto: CreateAppointmentDto) {
    // 1. Parallelize initial reads outside transaction
    const [doctor, availabilities] = await Promise.all([
      this.doctorModel.findById(dto.doctorId).select('consultationFee').lean(),
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
    const dayAvailability = await this.validateGeneralAvailability(
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
      await this.checkOverlap(
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
            specialistId: new Types.ObjectId(dto.specialistId),
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            appointmentEndTime: endTime,
            reasonTitle: dto.reasonTitle,
            reasonDetails: dto.reasonDetails,
            consultationFee: doctor.consultationFee || dayAvailability.fee,
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
      if (e.code === 11000) {
        throw new BadRequestException('This time slot is already booked');
      }
      throw e;
    } finally {
      session.endSession();
    }
  }

  private async validateGeneralAvailability(
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

  private async checkOverlap(
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
        status: { $ne: 'CANCELLED' },
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

  // ---------------- Available Slots ----------------
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
        status: { $ne: 'CANCELLED' },
      })
      .select('appointmentTime')
      .lean();

    const bookedTimes = new Set(
      existingAppointments.map((a) => a.appointmentTime),
    );

    // 4. Filter out booked slots
    return allSlots.map((time) => ({
      time,
      isAvailable: !bookedTimes.has(time),
      fee: dayAvailability.fee,
      duration: dayAvailability.slotSizeMinutes,
    }));
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  // ---------------- Lists ----------------
  async getForUser(userId: string) {
    const results = await this.appointmentModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('doctorId', 'currentOrganization consultationFee')
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .sort({ appointmentDate: -1 })
      .lean();
    return results;
  }

  async getForDoctor(userId: string, doctorId?: string) {
    if (doctorId) {
      return this.appointmentModel
        .find({ doctorId: new Types.ObjectId(doctorId) })
        .populate('userId', 'name email phone profileImage')
        .populate('specialistId', 'name')
        .populate('attachments')
        .sort({ appointmentDate: -1 })
        .lean();
    }

    // First, find the doctor profile by userId
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    // Then query appointments using the doctor's _id
    return this.appointmentModel
      .find({ doctorId: doctor._id })
      .populate('userId', 'name email phone profileImage')
      .populate('specialistId', 'name')
      .populate('attachments')
      .sort({ appointmentDate: -1 })
      .lean();
  }

  // ---------------- Status Updates ----------------
  async updateStatus(
    appointmentId: string,
    requesterId: string,
    role: string,
    status: string,
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
    if (['COMPLETED', 'CANCELLED'].includes(appointment.status)) {
      throw new BadRequestException(
        `Appointment is already ${appointment.status} and cannot be updated.`,
      );
    }

    appointment.status = status;
    return appointment.save();
  }

  async cancelUpcomingForDoctor(doctorId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.appointmentModel.updateMany(
      {
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: today },
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
      },
      { status: 'CANCELLED' },
    );
  }

  // ---------------- Attachments ----------------
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
