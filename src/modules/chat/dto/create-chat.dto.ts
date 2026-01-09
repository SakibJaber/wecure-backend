import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsEnum(['USER', 'DOCTOR'])
  @IsNotEmpty()
  senderRole: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
