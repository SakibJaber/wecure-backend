import { IsEnum } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @IsEnum(['CANCELLED', 'COMPLETED'])
  status: string;
}
