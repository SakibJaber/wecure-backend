import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PublicUploadService } from '../public-upload/public-upload.service';
import { UPLOAD_FOLDERS } from 'src/common/constants/constants';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly publicUploadService: PublicUploadService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    try {
      const imageUrl = await this.publicUploadService.handleUpload(
        file,
        UPLOAD_FOLDERS.CHAT,
      );
      return {
        success: true,
        statusCode: 201,
        message: 'Image uploaded successfully',
        data: { url: imageUrl },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to upload image',
        data: null,
      };
    }
  }

  @Get('conversations')
  async getConversations(@Req() req) {
    try {
      const result = await this.chatService.getConversations(
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Conversations fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch conversations',
        data: null,
      };
    }
  }

  @Get('messages/:conversationId')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.getMessages(
        conversationId,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Messages fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch messages',
        data: null,
      };
    }
  }

  @Post('read/:conversationId')
  async markAsRead(
    @Param('conversationId') conversationId: string,
    @Req() req,
  ) {
    try {
      await this.chatService.markAsRead(
        conversationId,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Messages marked as read',
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to mark messages as read',
        data: null,
      };
    }
  }
}
