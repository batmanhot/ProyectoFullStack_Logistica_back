import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmailService } from './email.service';
import { EnviarDocumentoEmailDto } from './dto/enviar-documento-email.dto';
import { GenerarPdfDto } from './dto/generar-pdf.dto';

// Sin @Permiso() de módulo a propósito: este endpoint solo re-renderiza a PDF
// y envía un HTML que el frontend ya armó (y que el usuario ya tenía permiso
// de ver/imprimir en su pantalla de origen — Despachos, Proformas, OC,
// Cotizaciones). No expone ni muta datos de negocio.
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  // Envía un correo real de por sí (costo + riesgo de abuso) — límite propio,
  // más estricto que el default global (120/min), mismo criterio que los
  // endpoints de login (ver auth.controller.ts).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('enviar-documento')
  enviarDocumento(@Body() dto: EnviarDocumentoEmailDto) {
    return this.emailService.enviarDocumento(dto);
  }

  // Solo renderiza el PDF (sin enviarlo) — usado por el flujo de WhatsApp:
  // el frontend descarga el archivo y abre el chat con el mensaje ya escrito.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('generar-pdf')
  async generarPdf(@Body() dto: GenerarPdfDto) {
    const pdfBase64 = await this.emailService.generarPdfBase64(dto.html);
    return { pdfBase64, nombreArchivo: `${dto.numeroDocumento}.pdf` };
  }
}
