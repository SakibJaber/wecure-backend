import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsOptional()
  isActive?: boolean;
}
