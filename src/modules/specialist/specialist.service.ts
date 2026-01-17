import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';
import { Specialist, SpecialistDocument } from './schemas/specialist.schema';
import { PublicUploadService } from '../public-upload/public-upload.service';

@Injectable()
export class SpecialistService {
  constructor(
    @InjectModel(Specialist.name)
    private specialistModel: Model<SpecialistDocument>,
    private readonly publicUploadService: PublicUploadService,
  ) {}

  async create(
    createSpecialistDto: CreateSpecialistDto,
    file?: Express.Multer.File,
  ) {
    let thumbnailUrl: string | undefined;

    // Upload thumbnail if file is provided
    if (file) {
      thumbnailUrl = await this.publicUploadService.handleUpload(
        file,
        'specialists',
      );
    }

    const createdSpecialist = new this.specialistModel({
      ...createSpecialistDto,
      thumbnail: thumbnailUrl || createSpecialistDto.thumbnail,
    });
    return createdSpecialist.save();
  }

  async findAll(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.specialistModel.find().skip(skip).limit(limit).exec(),
      this.specialistModel.countDocuments(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const specialist = await this.specialistModel.findById(id).exec();
    if (!specialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }
    return specialist;
  }

  async update(
    id: string,
    updateSpecialistDto: UpdateSpecialistDto,
    file?: Express.Multer.File,
  ) {
    const specialist = await this.findOne(id);
    let thumbnailUrl: string | undefined;

    // Upload new thumbnail if file is provided
    if (file) {
      // Delete old thumbnail if exists
      if (specialist.thumbnail) {
        try {
          await this.publicUploadService.deleteFile(specialist.thumbnail);
        } catch (error) {
          console.error('Failed to delete old thumbnail:', error);
        }
      }

      thumbnailUrl = await this.publicUploadService.handleUpload(
        file,
        'specialists',
      );
    }

    const updatedSpecialist = await this.specialistModel
      .findByIdAndUpdate(
        id,
        {
          ...updateSpecialistDto,
          ...(thumbnailUrl && { thumbnail: thumbnailUrl }),
        },
        { new: true },
      )
      .exec();

    if (!updatedSpecialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }
    return updatedSpecialist;
  }

  async remove(id: string) {
    const specialist = await this.specialistModel.findById(id).exec();
    if (!specialist) {
      throw new NotFoundException(`Specialist with ID ${id} not found`);
    }

    // Delete thumbnail from S3 if exists
    if (specialist.thumbnail) {
      try {
        await this.publicUploadService.deleteFile(specialist.thumbnail);
      } catch (error) {
        // Log error but don't fail deletion
        console.error('Failed to delete specialist thumbnail:', error);
      }
    }

    await this.specialistModel.findByIdAndDelete(id).exec();
    return specialist;
  }
}
