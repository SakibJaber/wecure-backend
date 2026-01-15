import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateContactSupportDto } from './dto/create-contact-support.dto';
import { UpdateContactSupportDto } from './dto/update-contact-support.dto';
import {
  ContactSupport,
  ContactSupportDocument,
} from './schemas/contact-support.schema';

@Injectable()
export class ContactSupportService {
  constructor(
    @InjectModel(ContactSupport.name)
    private contactSupportModel: Model<ContactSupportDocument>,
  ) {}

  async create(
    createContactSupportDto: CreateContactSupportDto,
    userId: string,
  ): Promise<ContactSupport> {
    const newMessage = new this.contactSupportModel({
      ...createContactSupportDto,
      userId: new Types.ObjectId(userId),
    });
    return newMessage.save();
  }

  async findAll(): Promise<ContactSupport[]> {
    return this.contactSupportModel
      .find()
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByUser(userId: string): Promise<ContactSupport[]> {
    return this.contactSupportModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<ContactSupport> {
    const message = await this.contactSupportModel
      .findById(id)
      .populate('userId', 'name email role')
      .exec();

    if (!message) {
      throw new NotFoundException(
        `Contact support message with ID ${id} not found`,
      );
    }

    return message;
  }

  async update(
    id: string,
    updateContactSupportDto: UpdateContactSupportDto,
  ): Promise<ContactSupport> {
    const updatedMessage = await this.contactSupportModel
      .findByIdAndUpdate(id, updateContactSupportDto, { new: true })
      .populate('userId', 'name email role')
      .exec();

    if (!updatedMessage) {
      throw new NotFoundException(
        `Contact support message with ID ${id} not found`,
      );
    }

    return updatedMessage;
  }

  async remove(id: string): Promise<ContactSupport> {
    const deletedMessage = await this.contactSupportModel
      .findByIdAndDelete(id)
      .exec();

    if (!deletedMessage) {
      throw new NotFoundException(
        `Contact support message with ID ${id} not found`,
      );
    }

    return deletedMessage;
  }
}
