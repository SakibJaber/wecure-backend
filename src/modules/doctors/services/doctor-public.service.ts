import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Doctor, DoctorDocument } from '../schemas/doctor.schema';
import {
  DoctorService,
  DoctorServiceDocument,
} from '../schemas/doctor-service.schema';
import {
  DoctorExperience,
  DoctorExperienceDocument,
} from '../schemas/doctor-experience.schema';
import { Review, ReviewDocument } from '../../reviews/schemas/review.schema';
import { AvailabilityService } from '../../availability/availability.service';
import { DoctorAggregationHelper } from '../helpers/doctor-aggregation.helper';
import { DoctorSlotsHelper } from '../helpers/doctor-slots.helper';

@Injectable()
export class DoctorPublicService {
  constructor(
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
    @InjectModel(DoctorService.name)
    private doctorServiceModel: Model<DoctorServiceDocument>,
    @InjectModel(DoctorExperience.name)
    private doctorExperienceModel: Model<DoctorExperienceDocument>,
    @InjectModel(Review.name)
    private reviewModel: Model<ReviewDocument>,

    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,
    private readonly aggregationHelper: DoctorAggregationHelper,
    private readonly slotsHelper: DoctorSlotsHelper,
  ) {}

  async getPublicProfile(doctorId: string) {
    const doctor = await this.doctorModel
      .findOne({ _id: doctorId, isVerified: true })
      .select('-verificationDocuments')
      .populate('userId', 'name email profileImage')
      .populate('specialtyId', 'name')
      .lean();

    if (!doctor) throw new NotFoundException('Doctor not found');

    // Run all queries in parallel for better performance
    const [services, experiences, reviews, ratingStats, availability] =
      await Promise.all([
        this.doctorServiceModel.find({ doctorId: doctor._id }).lean(),
        this.doctorExperienceModel
          .find({ doctorId: doctor._id })
          .sort({ isCurrent: -1, startDate: -1 })
          .lean(),
        this.reviewModel
          .find({
            $or: [{ doctorId: doctor._id }, { doctorId: doctor._id.toString() }],
          })
          .populate('userId', 'name profileImage')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        this.getDoctorRatingStats(doctor._id),
        this.availabilityService.getByDoctor(doctor._id as Types.ObjectId),
      ]);

    // Calculate total experience years
    (doctor as any).totalExperienceYears =
      this.calculateTotalExperience(experiences);

    return {
      doctor,
      services,
      experiences,
      rating: ratingStats,
      reviews,
      availability,
    };
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

  private async getDoctorRatingStats(doctorId: Types.ObjectId) {
    const doctorIdStr = doctorId.toString();

    const [result] = await this.reviewModel.aggregate([
      {
        $match: {
          $or: [{ doctorId }, { doctorId: doctorIdStr }],
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                average: { $avg: '$rating' },
              },
            },
          ],
          breakdown: [
            {
              $group: {
                _id: '$rating',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of result?.breakdown || []) {
      const rating = Number(item._id);
      if (rating >= 1 && rating <= 5) {
        breakdown[rating] = item.count;
      }
    }

    const summary = result?.summary?.[0];
    const total = summary?.total || 0;
    const average =
      total > 0 ? parseFloat((summary?.average || 0).toFixed(1)) : 0;

    return { average, total, breakdown };
  }
}
