import { Injectable } from '@nestjs/common';
import { PipelineStage } from 'mongoose';

/**
 * Helper class for building reusable MongoDB aggregation pipeline stages
 * for doctor queries. Reduces code duplication across service methods.
 */
@Injectable()
export class DoctorAggregationHelper {
  /**
   * Adds a doctorIdString field for type conversion compatibility
   */
  addDoctorIdStringField(): PipelineStage {
    return {
      $addFields: {
        doctorIdString: { $toString: '$_id' },
      },
    };
  }

  /**
   * Lookup reviews with type conversion handling for ObjectId/string mismatch
   */
  lookupReviews(): PipelineStage {
    return {
      $lookup: {
        from: 'reviews',
        let: { doctorId: '$_id', doctorIdStr: '$doctorIdString' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$doctorId', '$$doctorId'] },
                  { $eq: [{ $toString: '$doctorId' }, '$$doctorIdStr'] },
                ],
              },
            },
          },
        ],
        as: 'reviews',
      },
    };
  }

  /**
   * Calculate average rating and total reviews count
   */
  calculateRatings(): PipelineStage {
    return {
      $addFields: {
        averageRating: {
          $cond: {
            if: { $gt: [{ $size: '$reviews' }, 0] },
            then: { $avg: '$reviews.rating' },
            else: 0,
          },
        },
        totalReviews: { $size: '$reviews' },
      },
    };
  }

  /**
   * Lookup user details (name, profileImage) with type conversion
   */
  lookupUserDetails(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'users',
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$userId'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$userId' }] },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
                profileImage: 1,
              },
            },
          ],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Lookup specialty details with type conversion
   */
  lookupSpecialtyDetails(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'specialists',
          let: { specialtyId: '$specialtyId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$specialtyId'] },
                    {
                      $eq: [
                        { $toString: '$_id' },
                        { $toString: '$$specialtyId' },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
              },
            },
          ],
          as: 'specialty',
        },
      },
      {
        $unwind: {
          path: '$specialty',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Lookup availabilities and calculate minimum fee
   */
  lookupAvailabilities(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'doctoravailabilities',
          localField: '_id',
          foreignField: 'doctorId',
          as: 'availabilities',
        },
      },
      {
        $addFields: {
          minFee: {
            $cond: {
              if: { $gt: [{ $size: '$availabilities' }, 0] },
              then: { $min: '$availabilities.fee' },
              else: 0,
            },
          },
        },
      },
    ];
  }

  /**
   * Project fields for doctor card view
   * @param includeAvailabilities - Whether to include availability data
   */
  projectDoctorCard(includeAvailabilities = false): PipelineStage {
    const baseProjection = {
      _id: 1,
      name: '$user.name',
      profileImage: { $ifNull: ['$user.profileImage', null] },
      specialty: '$specialty.name',
      currentOrganization: 1,
      experienceYears: 1,
      averageRating: { $round: ['$averageRating', 1] },
      totalReviews: 1,
    };

    if (includeAvailabilities) {
      return {
        $project: {
          ...baseProjection,
          minFee: 1,
          availabilities: 1,
        },
      };
    }

    return {
      $project: baseProjection,
    };
  }

  /**
   * Sort by average rating descending
   */
  sortByRating(): PipelineStage {
    return {
      $sort: { averageRating: -1 },
    };
  }
}
