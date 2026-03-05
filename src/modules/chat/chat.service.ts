import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { EncryptionService } from 'src/common/services/encryption.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async saveMessage(payload: {
    sender: { id: string; role: string };
    receiver: { id: string; role: string };
    text: string;
    images?: string[];
    video?: string;
    videoCover?: string;
  }) {
    const { sender, receiver, text, images, video, videoCover } = payload;

    const senderId = new Types.ObjectId(sender.id);
    const receiverId = new Types.ObjectId(receiver.id);

    // 1. Find or create conversation
    let conversation = await this.conversationModel.findOne({
      'participants.id': {
        $all: [senderId, receiverId],
      },
    });

    if (!conversation) {
      conversation = await this.conversationModel.create({
        participants: [
          { id: senderId, role: sender.role },
          { id: receiverId, role: receiver.role },
        ],
        messages: [],
      });
    }

    // 2. Encrypt message text
    const encryptedText = text ? this.encryptionService.encrypt(text) : '';

    // 3. Save message
    const newMessage = (await this.messageModel.create({
      conversationId: conversation._id,
      sender: { id: senderId, role: sender.role },
      receiver: { id: receiverId, role: receiver.role },
      text: encryptedText,
      images: images || [],
      video: video || null,
      videoCover: videoCover || null,
      seen: false,
    })) as MessageDocument;

    // 4. Update conversation
    await this.conversationModel.updateOne(
      { _id: (conversation as any)._id },
      {
        $push: { messages: newMessage._id as Types.ObjectId },
        $set: { 'meta.lastActivityAt': new Date() },
      },
    );

    return this.decryptMessage(newMessage.toObject());
  }

  async getConversationUpdate(conversationId: string, lastMessage: any) {
    const conversation = (await this.conversationModel
      .findById(new Types.ObjectId(conversationId))
      .lean()) as any;
    if (!conversation) return null;

    return {
      conversationId,
      participants: conversation.participants,
      lastMessage,
      updatedAt: new Date(),
    };
  }

  async markAsRead(conversationId: string, userId: string, role: string) {
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        'receiver.id': new Types.ObjectId(userId),
        'receiver.role': role,
        seen: false,
      },
      { $set: { seen: true } },
    );
  }

  async decryptMessage(message: any) {
    if (message && message.text) {
      message.text = this.encryptionService.decrypt(message.text);
    }
    return message;
  }

  async getConversations(userId: string, role: string) {
    const conversations = await this.conversationModel
      .find({
        'participants.id': new Types.ObjectId(userId),
      })
      .sort({ updatedAt: -1 })
      .lean();

    return conversations;
  }

  async getMessages(conversationId: string, userId: string, role: string) {
    const convoId = new Types.ObjectId(conversationId);

    // Check if user is part of conversation
    const conversation = (await this.conversationModel
      .findById(convoId)
      .lean()) as any;
    if (!conversation) throw new NotFoundException('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p: any) => p.id.toString() === userId,
    );
    if (!isParticipant) throw new ForbiddenException('Access denied');

    const messages = await this.messageModel
      .find({ conversationId: convoId })
      .sort({ createdAt: 1 })
      .lean();

    return messages.map((m: any) => {
      if (m.text) {
        m.text = this.encryptionService.decrypt(m.text);
      }
      return m;
    });
  }

  async findAll(userId: string, role: string) {
    return this.getConversations(userId, role);
  }
}
