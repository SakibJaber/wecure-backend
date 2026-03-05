import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
  path: '/socket.io',
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('ChatGateway');
  private onlineUsers = new Map<string, string>(); // roomName -> socketId

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Chat Gateway initialized');
  }

  async handleConnection(socket: Socket) {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1] ||
      socket.handshake.query?.token;

    if (!token) {
      this.logger.warn(`Connection attempt without token: ${socket.id}`);
      socket.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.userId;
      const userRole = (payload.role || 'USER').toUpperCase();

      if (!userId) {
        this.logger.warn(`Invalid token payload: ${socket.id}`);
        socket.disconnect();
        return;
      }

      const roomName = `${userRole}:${userId}`;
      socket.join(roomName);
      this.onlineUsers.set(roomName, socket.id);

      this.logger.log(
        `User connected: ${userId} (${userRole}) in room ${roomName}`,
      );

      socket.emit('connection_confirmed', {
        success: true,
        message: 'Connected to socket',
        data: { room: roomName, userId, role: userRole },
      });
    } catch (error) {
      this.logger.warn(`Connection failed - Invalid token: ${error.message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`Socket disconnected: ${socket.id}`);
    // We don't necessarily need to delete from onlineUsers by room name here
    // because one user might have multiple tabs/sockets.
    // But for simplicity in this implementation, we can leave it or improve it.
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    payload: {
      sender: { id: string; role: string };
      receiver: { id: string; role: string };
      text: string;
      images?: string[];
      video?: string;
      videoCover?: string;
    },
  ) {
    this.logger.log(
      `Message from ${payload.sender.id} to ${payload.receiver.id}`,
    );

    try {
      const savedMessage = await this.chatService.saveMessage(payload);

      const receiverRoom = `${payload.receiver.role.toUpperCase()}:${payload.receiver.id}`;
      const senderRoom = `${payload.sender.role.toUpperCase()}:${payload.sender.id}`;

      // Emit to receiver (generic and specific)
      this.server.to(receiverRoom).emit('message_new', savedMessage);
      this.server
        .to(receiverRoom)
        .emit(`message_new/${payload.sender.id}`, savedMessage);

      // Emit to sender (generic and specific)
      this.server.to(senderRoom).emit('message_new', savedMessage);
      this.server
        .to(senderRoom)
        .emit(`message_new/${payload.receiver.id}`, savedMessage);

      // Emit conversation update
      const conversationUpdate = await this.chatService.getConversationUpdate(
        savedMessage.conversationId.toString(),
        savedMessage,
      );

      this.server
        .to(receiverRoom)
        .emit('conversation_update', conversationUpdate);
      this.server
        .to(senderRoom)
        .emit('conversation_update', conversationUpdate);
    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`);
      socket.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody()
    payload: {
      conversationId: string;
      sender: any;
      receiver: any;
    },
  ) {
    const receiverRoom = `${payload.receiver.role.toUpperCase()}:${payload.receiver.id}`;
    this.server.to(receiverRoom).emit('typing', {
      conversationId: payload.conversationId,
      sender: payload.sender,
    });
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(
    @MessageBody()
    payload: {
      conversationId: string;
      sender: any;
      receiver: any;
    },
  ) {
    const receiverRoom = `${payload.receiver.role.toUpperCase()}:${payload.receiver.id}`;
    this.server.to(receiverRoom).emit('stop_typing', {
      conversationId: payload.conversationId,
      sender: payload.sender,
    });
  }

  @SubscribeMessage('mark_messages_as_read')
  async handleMarkAsRead(
    @MessageBody()
    payload: {
      conversationId: string;
      myId: string;
      myRole: string;
      senderId: string;
      senderRole: string;
    },
  ) {
    await this.chatService.markAsRead(
      payload.conversationId,
      payload.myId,
      payload.myRole,
    );

    const receiverRoom = `${payload.senderRole.toUpperCase()}:${payload.senderId}`;
    const myRoom = `${payload.myRole.toUpperCase()}:${payload.myId}`;

    const update = { conversationId: payload.conversationId, seen: true };
    this.server.to(receiverRoom).emit('mark_messages_as_read', update);
    this.server.to(myRoom).emit('mark_messages_as_read', update);
  }
}
