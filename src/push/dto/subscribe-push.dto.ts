import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

export class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SubscribePushDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
