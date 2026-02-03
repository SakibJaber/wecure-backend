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
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { UploadsService } from '../uploads/uploads.service';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { DoctorAggregationHelper } from './helpers/doctor-aggregation.helper';
import { DoctorRatingHelper } from './helpers/doctor-rating.helper';
import { DoctorSlotsHelper } from './helpers/doctor-slots.helper';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,

    private readonly uploadsService: UploadsService,
    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,

    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService: AppointmentsService,

    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly publicUploadService: PublicUploadService,
    private readonly notificationsService: NotificationsService,
    private readonly aggregationHelper: DoctorAggregationHelper,
    private readonly ratingHelper: DoctorRatingHelper,
    private readonly slotsHelper: DoctorSlotsHelper,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ---------- Doctor Profile ----------
  async createProfile(userId: string, dto: any) {
    const exists = await this.doctorModel.findOne({ userId });
    if (exists) throw new ForbiddenException('Doctor profile already exists');

    const { phone, ...doctorData } = dto;
    if (phone) {
      await this.usersService.updateProfile(userId, { phone });
    }

    return this.doctorModel.create({
      userId,
      ...doctorData,
    });
  }

  async updateProfile(userId: string, dto: any, file?: Express.Multer.File) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const { phone, ...doctorData } = dto;

    const userUpdate: any = {};
    if (file) {
      const imageUrl = await this.publicUploadService.handleUpload(
        file,
        UPLOAD_FOLDERS.USER_PROFILES,
      );
      userUpdate.profileImage = imageUrl;
    }

    if (phone) {
      userUpdate.phone = phone;
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.usersService.updateProfile(userId, userUpdate);
    }

    return this.doctorModel
      .findByIdAndUpdate(doctor._id, doctorData, { new: true })
      .populate('userId', 'name email phone profileImage')
      .populate('specialtyId', 'name');
  }

  async getMyProfile(userId: string) {
    const doctor = await this.doctorModel.findOne({ userId }).lean();
    if (!doctor) return null;

    if (
      doctor.verificationDocuments &&
      doctor.verificationDocuments.length > 0
    ) {
      doctor.verificationDocuments = await Promise.all(
        doctor.verificationDocuments.map((key) =>
          this.uploadsService.generateViewUrl(key, userId),
        ),
      );
    }

    // Add total experience years
    const experiences = await this.doctorExperienceModel.find({
      doctorId: doctor._id,
    });
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

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

    const experience = await this.doctorExperienceModel.create({
      doctorId: doctor._id,
      ...dto,
    });

    // Recalculate and update doctor's total experience years
    const experiences = await this.doctorExperienceModel.find({
      doctorId: doctor._id,
    });
    const totalYears = this.calculateTotalExperience(experiences);
    await this.doctorModel.findByIdAndUpdate(doctor._id, {
      experienceYears: totalYears,
    });

    return experience;
  }

  async listExperiences(doctorId: string) {
    return this.doctorExperienceModel
      .find({ doctorId })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();
  }

  async uploadVerificationDocuments(
    userId: string,
    files: Express.Multer.File[],
  ) {
    const doctor = await this.doctorModel.findOne({ userId });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const uploadPromises = files.map((file) =>
      this.uploadsService.uploadBuffer(
        file.buffer,
        file.mimetype,
        'verifications',
        file.originalname,
        userId,
      ),
    );

    const documentKeys = await Promise.all(uploadPromises);

    doctor.verificationDocuments.push(...documentKeys);
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

    // Emit events for notifications (replaces direct mail calls)
    if (user) {
      if (status === 'VERIFIED') {
        if (previousStatus === 'SUSPENDED') {
          this.notificationsService.emit('doctor.unsuspended', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        } else if (previousStatus !== 'VERIFIED') {
          this.notificationsService.emit('doctor.verified', {
            doctorId,
            userId: user._id,
            email: user.email,
            name: user.name,
          });
        }
      } else if (status === 'REJECTED') {
        this.notificationsService.emit('doctor.rejected', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentsService.cancelUpcomingForDoctor(doctorId);
      } else if (status === 'SUSPENDED') {
        this.notificationsService.emit('doctor.suspended', {
          doctorId,
          userId: user._id,
          email: user.email,
          name: user.name,
          note,
        });
        // Side effects (non-blocking)
        this.availabilityService.deactivateAllForDoctor(doctorId);
        this.appointmentsService.cancelUpcomingForDoctor(doctorId);
      }
    }

    return updatedDoctor;
  }

  async getAllDoctorsForAdmin(adminId: string, query: any) {
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
        .populate('userId', 'name email phone')
        .populate('specialtyId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.doctorModel.countDocuments(filter),
    ]);

    // Fetch experiences for all these doctors in one go for efficiency
    const doctorIds = doctors.map((d) => d._id);
    const allExperiences = await this.doctorExperienceModel.find({
      doctorId: { $in: doctorIds },
    });
    const expMap = allExperiences.reduce((acc, exp) => {
      const id = exp.doctorId.toString();
      if (!acc[id]) acc[id] = [];
      acc[id].push(exp);
      return acc;
    }, {});

    // Generate pre-signed URLs for verification documents and add experience
    for (const doctor of doctors) {
      // Decrypt phone number if it exists
      const user = doctor.userId as any;
      if (user && user.phone) {
        user.phone = this.encryptionService.decrypt(user.phone);
      }

      if (
        doctor.verificationDocuments &&
        doctor.verificationDocuments.length > 0
      ) {
        doctor.verificationDocuments = await Promise.all(
          doctor.verificationDocuments.map((key) =>
            this.uploadsService.generateViewUrl(key, adminId),
          ),
        );
      }
      // Add total experience years (prefer pre-calculated field if exists)
      if (
        doctor.experienceYears !== undefined &&
        doctor.experienceYears !== null
      ) {
        (doctor as any).totalExperienceYears = doctor.experienceYears;
      } else {
        const doctorExp = expMap[doctor._id.toString()] || [];
        (doctor as any).totalExperienceYears =
          this.calculateTotalExperience(doctorExp);
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

  async getDoctorByIdForAdmin(doctorId: string, adminId: string) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'name email phone profileImage')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    // Decrypt phone number
    const user = doctor.userId as any;
    if (user && user.phone) {
      user.phone = this.encryptionService.decrypt(user.phone);
    }

    // Generate URLs for verification documents
    if (
      doctor.verificationDocuments &&
      doctor.verificationDocuments.length > 0
    ) {
      doctor.verificationDocuments = await Promise.all(
        doctor.verificationDocuments.map((key) =>
          this.uploadsService.generateViewUrl(key, adminId),
        ),
      );
    }

    // Parallel fetch for services and experiences
    const [services, experiences] = await Promise.all([
      this.doctorServiceModel.find({ doctorId: doctor._id }).lean(),
      this.doctorExperienceModel
        .find({ doctorId: doctor._id })
        .sort({ isCurrent: -1, startDate: -1 })
        .lean(),
    ]);

    // Add total experience
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

    return {
      ...doctor,
      services,
      experiences,
    };
  }

  async getPublicProfile(doctorId: string) {
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId, isVerified: true })
      .select('-verificationDocuments')
      .populate('userId', 'name email profileImage')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    // Run all queries in parallel for better performance
    const doctorIdStr = doctor._id.toString();
    const [services, experiences, reviews, availability] = await Promise.all([
      this.doctorServiceModel.find({ doctorId: doctor._id }),
      this.doctorExperienceModel
        .find({ doctorId: doctor._id })
        .sort({ isCurrent: -1, startDate: -1 }),
      this.reviewModel
        .find({
          $or: [{ doctorId: doctor._id }, { doctorId: doctorIdStr }],
        })
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .lean(),
      this.availabilityService.getByDoctor(doctor._id as Types.ObjectId),
    ]);

    // Use rating helper to calculate statistics
    const ratingStats = this.ratingHelper.getRatingStats(reviews);

    // Calculate total experience years
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

    return {
      doctor,
      services,
      experiences,
      rating: ratingStats,
      reviews: reviews.slice(0, 10), // Return latest 10 reviews
      availability,
    };
  }

  private calculateTotalExperience(experiences: any[]): number {
    if (!experiences || experiences.length === 0) return 0;

    let totalMonths = 0;
    const now = new Date();

    experiences.forEach((exp) => {
      const start = new Date(exp.startDate);
      const end = exp.isCurrent || !exp.endDate ? now : new Date(exp.endDate);

      const diffMonths =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      if (diffMonths > 0) {
        totalMonths += diffMonths;
      }
    });

    return Math.floor(totalMonths / 12);
  }

  async getPopularDoctors() {
    const popularDoctors = await this.doctorModel.aggregate([
      // Match verified doctors only
      {
        $match: {
          isVerified: true,
          verificationStatus: 'VERIFIED',
        },
      },
      // Add helper pipeline stages
      this.aggregationHelper.addDoctorIdStringField(),
      this.aggregationHelper.lookupReviews(),
      this.aggregationHelper.calculateRatings(),
      this.aggregationHelper.lookupExperiences(),
      this.aggregationHelper.calculateExperience(),
      // Filter for doctors with rating >= 4
      {
        $match: {
          averageRating: { $gte: 4 },
        },
      },
      // Lookup user and specialty details
      ...this.aggregationHelper.lookupUserDetails(),
      ...this.aggregationHelper.lookupSpecialtyDetails(),
      // Project and sort
      this.aggregationHelper.projectDoctorCard(false),
      this.aggregationHelper.sortByRating(),
    ]);

    return popularDoctors;
  }

  async getDoctorsBySpecialty(specialtyId: string) {
    const doctors = await this.doctorModel.aggregate([
      // Match verified doctors with the given specialty
      {
        $match: {
          isVerified: true,
          verificationStatus: 'VERIFIED',
          $expr: {
            $or: [
              { $eq: ['$specialtyId', new Types.ObjectId(specialtyId)] },
              { $eq: [{ $toString: '$specialtyId' }, specialtyId] },
            ],
          },
        },
      },
      // Add helper pipeline stages
      this.aggregationHelper.addDoctorIdStringField(),
      this.aggregationHelper.lookupReviews(),
      this.aggregationHelper.calculateRatings(),
      this.aggregationHelper.lookupExperiences(),
      this.aggregationHelper.calculateExperience(),
      // Lookup availabilities and user/specialty details
      ...this.aggregationHelper.lookupAvailabilities(),
      ...this.aggregationHelper.lookupUserDetails(),
      {
        $lookup: {
          from: 'specialists',
          localField: 'specialtyId',
          foreignField: '_id',
          as: 'specialty',
        },
      },
      {
        $unwind: {
          path: '$specialty',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Project and sort
      this.aggregationHelper.projectDoctorCard(true),
      this.aggregationHelper.sortByRating(),
    ]);

    // Use slots helper to add next available slots
    return doctors.map((doctor) => {
      const nextAvailableSlots = this.slotsHelper.generateNextAvailableSlots(
        doctor,
        this.availabilityService,
      );

      return {
        ...doctor,
        nextAvailableSlots,
        availabilities: undefined, // Remove raw availability data
      };
    });
  }
}
