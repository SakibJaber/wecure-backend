import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateDoctorDto {
  @IsNotEmpty()
  currentOrganization: string;

  @IsNotEmpty()
  specialtyId: string;

  @IsNumber()
  consultationFee: number;

  about?: string;
}
