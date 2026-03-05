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
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<any>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async saveMessage(payload: {
    sender: { id: string; role: string };
    receiver: { id: string; role: string };
    text: string;
    images?: string[];
    video?: string;
    videoCover?: string;
    appointmentId?: string;
  }) {
    const { sender, receiver, text, images, video, videoCover, appointmentId } =
      payload;

    const senderId = new Types.ObjectId(sender.id);
    const receiverId = new Types.ObjectId(receiver.id);

    // 1. Find or create conversation
    const query: any = {
      'participants.id': {
        $all: [senderId, receiverId],
      },
      appointmentId: appointmentId ? new Types.ObjectId(appointmentId) : null,
    };

    let conversation = await this.conversationModel.findOne(query);

    if (!conversation) {
      conversation = await this.conversationModel.create({
        participants: [
          { id: senderId, role: sender.role },
          { id: receiverId, role: receiver.role },
        ],
        appointmentId: appointmentId
          ? new Types.ObjectId(appointmentId)
          : (null as any),
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

    // Identify current user context for the update if possible,
    // but usually this is emitted to both. The receiver's perspective matters.
    // For general update, we just provide the basic structure.
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

  async getConversations(
    userId: string,
    role: string,
    appointmentId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const userObjectId = new Types.ObjectId(userId);
    const filter: any = {
      'participants.id': userObjectId,
    };

    if (appointmentId) {
      filter.appointmentId = new Types.ObjectId(appointmentId);
    }

    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ 'meta.lastActivityAt': -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages')
        .lean(),
      this.conversationModel.countDocuments(filter),
    ]);

    const formattedConversations = await Promise.all(
      conversations.map(async (convo: any) => {
        // Filter out current user
        const otherParticipants = convo.participants.filter(
          (p: any) =>
            p.id.toString() !== userId ||
            p.role.toUpperCase() !== role.toUpperCase(),
        );

        // Enrich remaining participants with user details
        const enrichedParticipants = await Promise.all(
          otherParticipants.map(async (p: any) => {
            const userInfo = await this.userModel
              .findById(p.id)
              .select('name profileImage')
              .lean();
            return {
              ...p,
              name: userInfo?.name || 'Unknown',
              image: userInfo?.profileImage || null,
            };
          }),
        );
        return {
          ...convo,
          participants: enrichedParticipants,
        };
      }),
    );

    // Get last message details separately since we excluded messages array from convo
    const conversationIds = conversations.map((c: any) => c._id);
    const lastMessages = await Promise.all(
      conversationIds.map(async (id: Types.ObjectId) => {
        let lastMsg = await this.messageModel
          .findOne({ conversationId: id })
          .sort({ createdAt: -1 })
          .lean();
        if (lastMsg) {
          lastMsg = await this.decryptMessage(lastMsg);
        }
        return { conversationId: id.toString(), lastMsg };
      }),
    );

    const finalConversations = formattedConversations.map((convo: any) => {
      const lastMsgObj = lastMessages.find(
        (m) => m.conversationId === convo._id.toString(),
      );
      return {
        ...convo,
        lastMessage: lastMsgObj?.lastMsg || null,
      };
    });

    return {
      data: finalConversations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMessages(
    conversationId: string,
    userId: string,
    role: string,
    page: number = 1,
    limit: number = 50,
  ) {
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

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: convoId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({ conversationId: convoId }),
    ]);

    // Re-sort to ascending order for frontend display if needed,
    // or keep descending. Usually, paginated fetch returns newest first.
    // However, the original code had createdAt: 1.
    // For pagination, we almost always want createdAt: -1 to get the LATEST messages.

    const decryptedMessages = messages.map((m: any) => {
      if (m.text) {
        m.text = this.encryptionService.decrypt(m.text);
      }
      return m;
    });

    return {
      data: decryptedMessages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMessagesByAppointment(
    appointmentId: string,
    userId: string,
    role: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const userObjectId = new Types.ObjectId(userId);
    const apptObjectId = new Types.ObjectId(appointmentId);

    // Find conversation for this appointment
    const conversation = (await this.conversationModel
      .findOne({ appointmentId: apptObjectId })
      .lean()) as any;

    if (!conversation) {
      return {
        conversationId: null,
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // Check if user is part of the conversation
    const isParticipant = conversation.participants.some(
      (p: any) => p.id.toString() === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    // If conversation exists, get messages
    const result = await this.getMessages(
      (conversation as any)._id.toString(),
      userId,
      role,
      page,
      limit,
    );

    return {
      conversationId: (conversation as any)._id,
      ...result,
    };
  }

  async findAll(
    userId: string,
    role: string,
    appointmentId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    return this.getConversations(userId, role, appointmentId, page, limit);
  }
}
