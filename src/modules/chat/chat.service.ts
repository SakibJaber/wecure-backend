import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chat, ChatDocument } from './schemas/chat.schema';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Chat.name)
    private readonly chatModel: Model<ChatDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    createChatDto: CreateChatDto,
    senderId: string,
    senderRole: string,
  ) {
    const encryptedMessage = this.encryptionService.encrypt(
      createChatDto.message,
    );
    const chat = new this.chatModel({
      ...createChatDto,
      appointmentId: new Types.ObjectId(createChatDto.appointmentId),
      senderId: new Types.ObjectId(senderId),
      senderRole,
      message: encryptedMessage,
    });
    return chat.save();
  }

  async findAll(userId: string, role: string) {
    // This might need to be filtered by appointmentId or similar
    // For now, let's assume we want to see chats where the user is the sender
    // or related to an appointment they are part of.
    // This is a simplified version.
    const chats = await this.chatModel
      .find({
        $or: [{ senderId: new Types.ObjectId(userId) }],
      })
      .lean();

    return chats.map((chat) => ({
      ...chat,
      message: this.encryptionService.decrypt(chat.message),
    }));
  }

  async findByAppointment(appointmentId: string, userId: string, role: string) {
    const chats = await this.chatModel
      .find({ appointmentId: new Types.ObjectId(appointmentId) })
      .lean();

    // In a real app, we'd verify the user is part of the appointment here

    return chats.map((chat) => ({
      ...chat,
      message: this.encryptionService.decrypt(chat.message),
    }));
  }

  async findOne(id: string, userId: string, role: string) {
    const chat = await this.chatModel.findById(id).lean();
    if (!chat) throw new NotFoundException('Chat not found');

    if (role !== 'ADMIN' && chat.senderId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return {
      ...chat,
      message: this.encryptionService.decrypt(chat.message),
    };
  }

  async update(
    id: string,
    updateChatDto: UpdateChatDto,
    userId: string,
    role: string,
  ) {
    const chat = await this.chatModel.findById(id);
    if (!chat) throw new NotFoundException('Chat not found');

    if (role !== 'ADMIN' && chat.senderId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (updateChatDto.message) {
      updateChatDto.message = this.encryptionService.encrypt(
        updateChatDto.message,
      );
    }

    Object.assign(chat, updateChatDto);
    return chat.save();
  }

  async remove(id: string, userId: string, role: string) {
    const chat = await this.chatModel.findById(id);
    if (!chat) throw new NotFoundException('Chat not found');

    if (role !== 'ADMIN' && chat.senderId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.chatModel.findByIdAndDelete(id);
  }
}
