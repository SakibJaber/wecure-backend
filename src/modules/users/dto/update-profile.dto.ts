import { IsOptional, IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profileImage?: string;

  @IsOptional()
  @IsString({ each: true })
  allergies?: string[];
}
