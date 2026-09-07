import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCdrDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  responsable?: string;
}
