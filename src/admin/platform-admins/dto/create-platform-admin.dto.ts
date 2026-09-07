import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreatePlatformAdminDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
