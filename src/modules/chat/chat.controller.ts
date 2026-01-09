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
  create(@Body() createChatDto: CreateChatDto) {
    return this.chatService.create(createChatDto);
  }

  @Get()
  findAll(@Req() req) {
    return this.chatService.findAll(req.user.userId, req.user.role);
  }

  @Get('appointment/:appointmentId')
  findByAppointment(@Param('appointmentId') appointmentId: string, @Req() req) {
    return this.chatService.findByAppointment(
      appointmentId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.chatService.findOne(id, req.user.userId, req.user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateChatDto: UpdateChatDto,
    @Req() req,
  ) {
    return this.chatService.update(
      id,
      updateChatDto,
      req.user.userId,
      req.user.role,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.chatService.remove(id, req.user.userId, req.user.role);
  }
}
