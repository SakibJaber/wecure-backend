import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor, DoctorDocument } from './schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from './schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from './schemas/doctor-experience.schema';
import { UploadsService } from '../uploads/uploads.service';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,

    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,

    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    private readonly uploadsService: UploadsService,

    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,

    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,

    private readonly mailService: MailService,
  ) {}

  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    const exists = await this.doctorModel.findOne({ userId });
    if (exists) throw new ForbiddenException('Doctor profile already exists');

    return this.doctorModel.create({
      userId,
      ...dto,
    });
  }

  async getMyProfile(userId: string) {
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (
      doctor &&
      doctor.verificationDocuments &&
      doctor.verificationDocuments.length > 0
    ) {
      doctor.verificationDocuments = await Promise.all(
        doctor.verificationDocuments.map((key) =>
          this.uploadsService.generateViewUrl(key),
        ),
      );
    }
    return doctor;
  }

  // ---------- Services ----------
  async addService(userId: string, name: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.doctorServiceModel.create({
      doctorId: doctor._id,
      name,
    });
  }

  async listServices(doctorId: string) {
    return this.doctorServiceModel.find({ doctorId }).lean();
  }

  async deleteService(userId: string, serviceId: string) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException();

    return this.doctorServiceModel.deleteOne({
      _id: serviceId,
      doctorId: doctor._id,
    });
  }

  // ---------- Experiences ----------
  async addExperience(userId: string, dto: any) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException();

    return this.doctorExperienceModel.create({
      doctorId: doctor._id,
      ...dto,
    });
  }

  async listExperiences(doctorId: string) {
    return this.doctorExperienceModel
      .find({ doctorId })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();
  }

  async uploadVerificationDocument(userId: string, file: Express.Multer.File) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const documentKey = await this.uploadsService.uploadBuffer(
      file.buffer,
      file.mimetype,
      'verifications',
      file.originalname,
    );

    doctor.verificationDocuments.push(documentKey);
    await doctor.save();
    return doctor;
  }

  async updateVerificationStatus(
    doctorId: string,
    status: string,
    note?: string,
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'name email');
    if (!doctor) throw new NotFoundException('Doctor not found');

    const previousStatus = doctor.verificationStatus;
    const user = doctor.userId as any;

    const updateData: any = {
      verificationStatus: status,
      verificationNote: note || '',
    };

    // Update isVerified for backward compatibility
    if (status === 'VERIFIED') {
      updateData.isVerified = true;
    } else {
      updateData.isVerified = false;
    }

    const updatedDoctor = await this.doctorModel.findByIdAndUpdate(
      doctorId,
      updateData,
      { new: true },
    );

    // Handle side effects and emails (Non-blocking for faster response)
    if (user && user.email) {
      const runSideEffects = async () => {
        try {
          if (status === 'VERIFIED') {
            if (previousStatus === 'SUSPENDED') {
              await this.mailService.sendDoctorUnsuspensionEmail(
                user.email,
                user.name,
              );
            } else if (previousStatus !== 'VERIFIED') {
              // Send acceptance email if moving to VERIFIED from anything else (PENDING, REJECTED, etc.)
              await this.mailService.sendDoctorAcceptanceEmail(
                user.email,
                user.name,
              );
            }
          } else if (status === 'REJECTED') {
            await this.mailService.sendDoctorRejectionEmail(
              user.email,
              user.name,
              note,
            );
            // Also deactivate availability and cancel appointments for rejected doctors
            await this.availabilityService.deactivateAllForDoctor(doctorId);
            await this.appointmentsService.cancelUpcomingForDoctor(doctorId);
          } else if (status === 'SUSPENDED') {
            await this.mailService.sendDoctorSuspensionEmail(
              user.email,
              user.name,
              note,
            );
            await this.availabilityService.deactivateAllForDoctor(doctorId);
            await this.appointmentsService.cancelUpcomingForDoctor(doctorId);
          }
        } catch (error) {
          // Log background task errors but don't block the response
          console.error(
            `Error in background side effects for doctor ${doctorId}:`,
            error,
          );
        }
      };

      // Trigger background tasks without awaiting
      runSideEffects();
    }

    return updatedDoctor;
  }

  async getAllDoctorsForAdmin(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) {
      filter.verificationStatus = query.status;
    }

    const [doctors, total] = await Promise.all([
      this.doctorModel
        .find(filter)
        .populate('userId', 'name email')
        .populate('specialtyId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.doctorModel.countDocuments(filter),
    ]);

    // Generate pre-signed URLs for verification documents
    for (const doctor of doctors) {
      if (
        doctor.verificationDocuments &&
        doctor.verificationDocuments.length > 0
      ) {
        doctor.verificationDocuments = await Promise.all(
          doctor.verificationDocuments.map((key) =>
            this.uploadsService.generateViewUrl(key),
          ),
        );
      }
    }

    return {
      data: doctors,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublicProfile(doctorId: string) {
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId, isVerified: true })
      .select('-verificationDocuments')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    const services = await this.doctorServiceModel.find({
      doctorId: doctor._id,
    });

    const experiences = await this.doctorExperienceModel
      .find({ doctorId: doctor._id })
      .sort({ isCurrent: -1, startDate: -1 });

    return {
      doctor,
      services,
      experiences,
    };
  }
}
