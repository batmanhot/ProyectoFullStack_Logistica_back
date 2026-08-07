import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnviarDocumentoEmailDto {
  @IsEmail()
  destinatarioEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinatarioNombre?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  asunto: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string;

  // Tipo legible del documento ("Guía de Remisión", "Orden de Compra"...) — arma
  // el cuerpo del correo (ver EmailService#armarCuerpoHtml). Sin esto, el correo
  // llegaba con el PDF adjunto pero sin ningún texto de presentación.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tipoDocumento: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  empresaNombre?: string;

  // HTML ya armado por el frontend (pdfTemplates.js) — se re-renderiza a PDF acá,
  // no se duplica la plantilla del documento en el backend.
  @IsString()
  @IsNotEmpty()
  html: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  numeroDocumento: string;
}
