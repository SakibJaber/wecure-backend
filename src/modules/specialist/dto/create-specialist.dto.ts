import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSpecialistDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
