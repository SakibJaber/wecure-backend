import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  doctorId: string;

  @IsString()
  @IsNotEmpty()
  specialistId: string;

  @IsDateString()
  @IsNotEmpty()
  appointmentDate: string;

  @IsString()
  @IsNotEmpty()
  appointmentTime: string;

  @IsString()
  @IsNotEmpty()
  reasonTitle: string;

  @IsString()
  @IsNotEmpty()
  reasonDetails: string;

  @IsOptional()
  @IsEnum(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @IsNumber()
  @IsNotEmpty()
  fee: number;
}
