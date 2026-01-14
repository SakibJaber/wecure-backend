import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';
import {
  WellnessTip,
  WellnessTipDocument,
} from './schemas/wellness-tip.schema';
import {
  WellnessTipLike,
  WellnessTipLikeDocument,
} from './schemas/wellness-tip-like.schema';

@Injectable()
export class WellnessTipsService {
  constructor(
    @InjectModel(WellnessTip.name)
    private wellnessTipModel: Model<WellnessTipDocument>,
    @InjectModel(WellnessTipLike.name)
    private wellnessTipLikeModel: Model<WellnessTipLikeDocument>,
  ) {}

  async toggleLike(tipId: string, userId: string) {
    const existingLike = await this.wellnessTipLikeModel.findOne({
      tipId,
      userId,
    });

    if (existingLike) {
      await this.wellnessTipLikeModel.deleteOne({ _id: existingLike._id });
      return { liked: false };
    } else {
      await this.wellnessTipLikeModel.create({ tipId, userId });
      return { liked: true };
    }
  }

  async create(createWellnessTipDto: CreateWellnessTipDto) {
    const createdTip = new this.wellnessTipModel(createWellnessTipDto);
    return createdTip.save();
  }

  async findAll() {
    return this.wellnessTipModel.find().exec();
  }

  async findOne(id: string) {
    const tip = await this.wellnessTipModel.findById(id).exec();
    if (!tip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }
    return tip;
  }

  async update(id: string, updateWellnessTipDto: UpdateWellnessTipDto) {
    const updatedTip = await this.wellnessTipModel
      .findByIdAndUpdate(id, updateWellnessTipDto, { new: true })
      .exec();
    if (!updatedTip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }
    return updatedTip;
  }

  async remove(id: string) {
    const deletedTip = await this.wellnessTipModel.findByIdAndDelete(id).exec();
    if (!deletedTip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }
    return deletedTip;
  }
}
