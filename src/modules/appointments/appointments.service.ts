import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import {
  AppointmentAttachment,
  AttachmentDocument,
} from './schemas/attachment.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { AvailabilityService } from '../availability/availability.service';
import { AgoraService } from '../agora/agora.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AddAppointmentAttachmentDto } from './dto/add-appointment-attachment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EncryptionService } from 'src/common/services/encryption.service';
import { UploadsService } from '../uploads/uploads.service';

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
    private readonly agoraService: AgoraService,
    private readonly notificationsService: NotificationsService,
    private readonly encryptionService: EncryptionService,
    private readonly uploadsService: UploadsService,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  generateAgoraToken(channelName: string, uid: string | number) {
    return this.agoraService.generateToken(channelName, uid);
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

      this.notificationsService.emit('appointment.created', appointment[0]);

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
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentTime')
      .lean();

    const bookedTimes = new Set(
      existingAppointments.map((a) => a.appointmentTime),
    );

    // 4. Filter out booked slots and past slots (if today)
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return allSlots
      .filter((time) => {
        if (isToday) {
          const slotMinutes = this.timeToMinutes(time);
          if (slotMinutes <= currentMinutes) {
            return false;
          }
        }
        return true;
      })
      .map((time) => ({
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

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      .select('appointmentDate appointmentTime')
      .lean();

    // Map: 'YYYY-MM-DD' -> Set<time>
    const bookedMap = new Map<string, Set<string>>();
    appointments.forEach((appt) => {
      const dateStr = this.formatDate(appt.appointmentDate);
      if (!bookedMap.has(dateStr)) {
        bookedMap.set(dateStr, new Set());
      }
      bookedMap.get(dateStr)!.add(appt.appointmentTime);
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

        const bookedSlots = bookedMap.get(dateStr) || new Set();
        const availableCount = allSlots.length - bookedSlots.size;

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

  // ---------------- Lists ----------------
  async getForUser(userId: string) {
    const results = await this.appointmentModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('doctorId', 'currentOrganization')
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .sort({ appointmentDate: -1 })
      .lean();

    // Decrypt sensitive data
    // Decrypt sensitive data and generate URLs
    return Promise.all(
      results.map(async (appt: any) => {
        if (appt.reasonTitle) {
          appt.reasonTitle = this.encryptionService.decrypt(appt.reasonTitle);
        }
        if (appt.reasonDetails) {
          appt.reasonDetails = this.encryptionService.decrypt(
            appt.reasonDetails,
          );
        }
        // Decrypt doctor phone
        if (appt.doctorId?.userId?.phone) {
          appt.doctorId.userId.phone = this.encryptionService.decrypt(
            appt.doctorId.userId.phone,
          );
        }
        // Transform attachments to include full URL
        if (appt.attachments && appt.attachments.length > 0) {
          appt.attachments = await Promise.all(
            appt.attachments.map(async (att: any) => {
              if (att.fileKey) {
                att.url = await this.uploadsService.generateViewUrl(
                  att.fileKey,
                  userId,
                );
              }
              return att;
            }),
          );
        }
        return appt;
      }),
    );
  }

  async getForDoctor(userId?: string, doctorId?: string, query: any = {}) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      filter.doctorId = new Types.ObjectId(doctorId);
    } else if (userId) {
      const doctor = await this.doctorModel.findOne({ userId }).lean();
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      filter.doctorId = doctor._id;
    } else {
      throw new BadRequestException('UserId or DoctorId is required');
    }

    if (query.status) {
      filter.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .populate('userId', 'name email phone profileImage')
        .populate('specialistId', 'name')
        .populate('attachments')
        .sort({ appointmentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.appointmentModel.countDocuments(filter),
    ]);

    // Decrypt sensitive data
    // Decrypt sensitive data and generate URLs
    const decryptedData = await Promise.all(
      data.map(async (appt: any) => {
        if (appt.reasonTitle) {
          appt.reasonTitle = this.encryptionService.decrypt(appt.reasonTitle);
        }
        if (appt.reasonDetails) {
          appt.reasonDetails = this.encryptionService.decrypt(
            appt.reasonDetails,
          );
        }
        // Decrypt patient phone
        if (appt.userId?.phone) {
          appt.userId.phone = this.encryptionService.decrypt(appt.userId.phone);
        }
        // Transform attachments to include full URL
        if (appt.attachments && appt.attachments.length > 0) {
          appt.attachments = await Promise.all(
            appt.attachments.map(async (att: any) => {
              if (att.fileKey) {
                att.url = await this.uploadsService.generateViewUrl(
                  att.fileKey,
                  userId,
                );
              }
              return att;
            }),
          );
        }
        return appt;
      }),
    );

    return {
      data: decryptedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

  async markAsPaid(appointmentId: string, paymentId: string) {
    return this.appointmentModel.findByIdAndUpdate(
      appointmentId,
      {
        paymentId: new Types.ObjectId(paymentId),
        // status: AppointmentStatus.UPCOMING, // Status might already be UPCOMING, but ensuring it.
        // Actually, prompt says "Mark payment status as PAID", appointment status might not change if it's already UPCOMING.
        // But let's just link the payment.
      },
      { new: true },
    );
  }

  async findById(id: string) {
    const appt = await this.appointmentModel.findById(id).lean();
    if (appt) {
      if (appt.reasonTitle) {
        appt.reasonTitle = this.encryptionService.decrypt(appt.reasonTitle);
      }
      if (appt.reasonDetails) {
        appt.reasonDetails = this.encryptionService.decrypt(appt.reasonDetails);
      }
    }
    return appt;
  }
}
