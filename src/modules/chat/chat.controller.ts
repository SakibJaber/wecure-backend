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
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async create(@Body() createChatDto: CreateChatDto) {
    try {
      const result = await this.chatService.create(createChatDto);
      return {
        success: true,
        statusCode: 201,
        message: 'Message sent successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to send message',
        data: null,
      };
    }
  }

  @Get()
  async findAll(@Req() req) {
    try {
      const result = await this.chatService.findAll(
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Chats fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch chats',
        data: null,
      };
    }
  }

  @Get('appointment/:appointmentId')
  async findByAppointment(
    @Param('appointmentId') appointmentId: string,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.findByAppointment(
        appointmentId,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Appointment chats fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch appointment chats',
        data: null,
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    try {
      const result = await this.chatService.findOne(
        id,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Chat message fetched successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to fetch chat message',
        data: null,
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateChatDto: UpdateChatDto,
    @Req() req,
  ) {
    try {
      const result = await this.chatService.update(
        id,
        updateChatDto,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Chat message updated successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to update chat message',
        data: null,
      };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    try {
      const result = await this.chatService.remove(
        id,
        req.user.userId,
        req.user.role,
      );
      return {
        success: true,
        statusCode: 200,
        message: 'Chat message deleted successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: error.status || 400,
        message: error.message || 'Failed to delete chat message',
        data: null,
      };
    }
  }
}
