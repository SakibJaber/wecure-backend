import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { EncryptionService } from 'src/common/services/encryption.service';
import { UploadsService } from '../../uploads/uploads.service';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import {
  AppointmentDetailsDto,
  DoctorInfoDto,
  AttachmentDto,
} from '../dto/appointment-details.dto';

@Injectable()
export class AppointmentFinderService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly uploadsService: UploadsService,
  ) {}

  async getForUser(userId: string, query: any = {}): Promise<any> {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const userObjectId = new Types.ObjectId(userId);

    const pipeline: any[] = [
      { $match: { userId: userObjectId } },
      { $sort: { appointmentDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'doctors',
                localField: 'doctorId',
                foreignField: '_id',
                as: 'doctor',
              },
            },
            { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'doctor.userId',
                foreignField: '_id',
                as: 'doctorUser',
              },
            },
            {
              $unwind: {
                path: '$doctorUser',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'specialists',
                localField: 'specialistId',
                foreignField: '_id',
                as: 'specialty',
              },
            },
            {
              $unwind: { path: '$specialty', preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1,
                doctorName: { $ifNull: ['$doctorUser.name', 'Unknown Doctor'] },
                specialtyName: { $ifNull: ['$specialty.name', 'General'] },
                appointmentDate: 1,
                appointmentTime: 1,
                appointmentEndTime: 1,
                status: 1,
                consultationFee: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.appointmentModel.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const data = result.data;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

    const [data, total, bookingRequestCount, acceptedCount] = await Promise.all(
      [
        this.appointmentModel
          .find(filter)
          .populate('userId', 'name email phone profileImage consultationFee')
          .populate('specialistId', 'name')
          .populate('attachments')
          .sort({ appointmentDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.appointmentModel.countDocuments(filter),
        this.appointmentModel.countDocuments({
          ...filter,
          status: AppointmentStatus.PENDING,
        }),
        this.appointmentModel.countDocuments({
          ...filter,
          status: AppointmentStatus.UPCOMING,
        }),
      ],
    );

    const projectedData = data.map((appt: any) => ({
      _id: appt._id,
      patientName: appt.userId?.name || 'Unknown',
      patientProfileImage: appt.userId?.profileImage,
      patientPhone: this.decryptValue(appt.userId?.phone),
      reasonTitle: this.decryptValue(appt.reasonTitle),
      appointmentDate: appt.appointmentDate,
      appointmentTime: appt.appointmentTime,
      appointmentEndTime: appt.appointmentEndTime,
      consultationFee: appt.consultationFee,
      status: appt.status,
    }));

    return {
      data: projectedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      bookingRequestCount,
      acceptedCount,
    };
  }

  async getAppointmentDetails(
    appointmentId: string,
    userId: string,
  ): Promise<AppointmentDetailsDto> {
    const appointment = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        userId: new Types.ObjectId(userId),
      })
      .populate({
        path: 'doctorId',
        select: 'userId currentOrganization experienceYears',
        populate: { path: 'userId', select: 'name profileImage' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found or you do not have access to it',
      );
    }

    const doctorId = (appointment.doctorId as any)._id;
    const [ratingStats] = await this.reviewModel.aggregate([
      { $match: { doctorId: new Types.ObjectId(doctorId) } },
      {
        $group: {
          _id: '$doctorId',
          total: { $sum: 1 },
          average: { $avg: '$rating' },
        },
      },
    ]);

    const totalReviews = ratingStats?.total || 0;
    const averageRating =
      totalReviews > 0
        ? parseFloat((ratingStats.average || 0).toFixed(1))
        : 0;

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      userId,
    );

    const doctorInfo: DoctorInfoDto = {
      name: (appointment.doctorId as any)?.userId?.name || 'Unknown Doctor',
      specialty: (appointment.specialistId as any)?.name || 'General',
      organization:
        (appointment.doctorId as any)?.currentOrganization || 'Not specified',
      rating: averageRating,
      totalReviews,
      experienceYears: (appointment.doctorId as any)?.experienceYears,
      profileImage: (appointment.doctorId as any)?.userId?.profileImage,
    };

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      doctorInfo,
      attachments,
      createdAt: (appointment as any).createdAt,
    };
  }

  async getAppointmentDetailsForDoctor(
    appointmentId: string,
    userId: string,
    doctorId?: string,
  ) {
    let targetDoctorId: Types.ObjectId;

    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      targetDoctorId = new Types.ObjectId(doctorId);
    } else {
      const doctor = await this.doctorModel.findOne({ userId }).lean();
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      targetDoctorId = doctor._id as Types.ObjectId;
    }

    const appointment = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        doctorId: targetDoctorId,
      })
      .populate({
        path: 'userId',
        select: 'name profileImage dateOfBirth phone allergies bloodGroup',
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found or you do not have permission',
      );
    }

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      userId,
    );

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      patient: this.decryptPatientPHI(appointment.userId),
      attachments,
      createdAt: (appointment as any).createdAt,
    };
  }

  async findById(id: string) {
    const appt = await this.appointmentModel.findById(id).lean();
    return this.enrichAppointmentData(appt);
  }

  private async enrichAppointmentData(appt: any, viewerId?: string) {
    if (!appt) return null;

    appt.reasonTitle = this.decryptValue(appt.reasonTitle);
    appt.reasonDetails = this.decryptValue(appt.reasonDetails);

    if (appt.doctorId?.userId?.phone) {
      appt.doctorId.userId.phone = this.decryptValue(
        appt.doctorId.userId.phone,
      );
    }
    if (appt.userId?.phone) {
      appt.userId.phone = this.decryptValue(appt.userId.phone);
    }

    if (appt.attachments && appt.attachments.length > 0) {
      appt.attachments = await this.formatAttachments(
        appt.attachments,
        viewerId,
      );
    }
    return appt;
  }

  async getAll(query: any = {}) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.doctorId && Types.ObjectId.isValid(query.doctorId)) {
      filter.doctorId = new Types.ObjectId(query.doctorId);
    }
    if (query.userId && Types.ObjectId.isValid(query.userId)) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    const [data, total] = await Promise.all([
      this.appointmentModel
        .find(filter)
        .populate({
          path: 'userId',
          select: 'name email profileImage',
        })
        .populate('specialistId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.appointmentModel.countDocuments(filter),
    ]);

    const projectedData = data.map((appt: any) => ({
      _id: appt._id,
      patientName: appt.userId?.name || 'Unknown',
      patientEmail: appt.userId?.email,
      patientProfileImage: appt.userId?.profileImage,
      specialtyName: appt.specialistId?.name || 'General',
      reasonTitle: this.decryptValue(appt.reasonTitle),
      appointmentDate: appt.appointmentDate,
      appointmentTime: appt.appointmentTime,
      status: appt.status,
      consultationFee: appt.consultationFee,
      createdAt: appt.createdAt,
    }));

    return {
      data: projectedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDetailsForAdmin(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid appointment ID');
    }

    const appointment = await this.appointmentModel
      .findById(id)
      .populate({
        path: 'userId',
        select:
          'name email phone profileImage dateOfBirth allergies bloodGroup',
      })
      .populate({
        path: 'doctorId',
        select: 'userId currentOrganization experienceYears',
        populate: { path: 'userId', select: 'name email phone profileImage' },
      })
      .populate('specialistId', 'name')
      .populate('attachments')
      .lean();

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const doctorDetails = appointment.doctorId as any;
    if (doctorDetails?.userId?.phone) {
      doctorDetails.userId.phone = this.decryptValue(
        doctorDetails.userId.phone,
      );
    }

    const attachments = await this.formatAttachments(
      (appointment as any).attachments || [],
      (appointment.userId as any)._id.toString(),
    );

    return {
      _id: appointment._id.toString(),
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      appointmentEndTime: appointment.appointmentEndTime,
      status: appointment.status,
      consultationFee: appointment.consultationFee,
      reasonTitle: this.decryptValue(appointment.reasonTitle),
      reasonDetails: this.decryptValue(appointment.reasonDetails),
      createdAt: (appointment as any).createdAt,
      patient: this.decryptPatientPHI(appointment.userId),
      doctor: doctorDetails,
      specialty: (appointment.specialistId as any)?.name || 'General',
      attachments,
    };
  }

  // Helpers
  private decryptValue(value?: string): string {
    return value ? this.encryptionService.decrypt(value) || '' : '';
  }

  private decryptPatientPHI(patient: any): any {
    if (!patient) return null;
    return {
      ...patient,
      phone: this.decryptValue(patient.phone),
      dateOfBirth: this.decryptValue(patient.dateOfBirth),
      allergies: this.decryptAllergies(patient.allergies),
    };
  }

  private decryptAllergies(allergies?: string): string[] {
    if (!allergies) return [];
    const decrypted = this.encryptionService.decrypt(allergies);
    if (!decrypted) return [];
    try {
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  private async formatAttachments(
    attachments: any[],
    userId?: string,
  ): Promise<AttachmentDto[]> {
    return Promise.all(
      (attachments || []).map(async (att: any) => {
        const url = att.fileKey
          ? await this.uploadsService.generateViewUrl(att.fileKey, userId)
          : '';
        return {
          _id: att._id.toString(),
          fileKey: att.fileKey || '',
          fileType: att.fileType || '',
          url,
          createdAt: att.createdAt,
        };
      }),
    );
  }
}
