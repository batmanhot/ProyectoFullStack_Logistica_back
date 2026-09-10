import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class ResolverAlertaSaludDto {
  /** Clave estable de la alerta derivada (ej. "limite_excedido:<empresaId>:usuarios"). */
  @IsString()
  @IsNotEmpty()
  clave: string;

  @IsIn(['resuelta', 'silenciada'])
  estado: 'resuelta' | 'silenciada';

  @IsOptional()
  @IsString()
  nota?: string;

  /** Solo para 'silenciada': días hasta que la alerta vuelva a mostrarse (omitido = indefinido). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  silenciarDias?: number;
}

export class ReabrirAlertaSaludDto {
  @IsString()
  @IsNotEmpty()
  clave: string;
}
