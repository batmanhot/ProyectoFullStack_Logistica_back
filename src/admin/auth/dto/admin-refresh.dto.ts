import { IsNotEmpty, IsString } from 'class-validator';

export class AdminRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
