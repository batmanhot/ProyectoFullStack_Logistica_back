import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import puppeteer, { Browser } from 'puppeteer';

/**
 * Convierte a PDF real el mismo HTML que ya arma pdfTemplates.js en el frontend
 * (Guía de Remisión, Proforma, OC, Cotización) y lo envía adjunto por correo.
 * No se duplica ninguna plantilla acá — el backend solo renderiza el HTML que
 * ya se ve idéntico en el "Generar PDF" del navegador.
 */
@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger('EmailService');
  private transporter: nodemailer.Transporter | null = null;
  private browser: Browser | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'El envío de correo no está configurado en el servidor (faltan SMTP_HOST / SMTP_USER / SMTP_PASS).',
      );
    }
    const port = Number(process.env.SMTP_PORT) || 587;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  /** Instancia única de Chromium reutilizada entre envíos — lanzarla por request es lento (~1-2s). */
  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return this.browser;
  }

  private async renderizarPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'A4' });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /** Solo genera el PDF, sin enviarlo — usado por WhatsApp (descarga + abre el chat con el mensaje listo). */
  async generarPdfBase64(html: string): Promise<string> {
    const buffer = await this.renderizarPdf(html);
    return buffer.toString('base64');
  }

  /** Cuerpo del correo (presentación + referencia del documento) — antes se mandaba sin texto, solo el PDF adjunto. */
  private armarCuerpoCorreo(dto: {
    destinatarioNombre?: string;
    mensaje?: string;
    tipoDocumento: string;
    numeroDocumento: string;
    empresaNombre: string;
  }) {
    const saludo = dto.destinatarioNombre ? `Estimado(a) ${dto.destinatarioNombre},` : 'Estimado(a),';
    const cuerpo =
      dto.mensaje || `Le remitimos el siguiente documento: ${dto.tipoDocumento} ${dto.numeroDocumento}.`;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#222">
  <div style="max-width:560px;margin:0 auto;padding:32px 28px;background:#fff">
    <div style="border-bottom:3px solid #00c896;padding-bottom:14px;margin-bottom:22px">
      <div style="font-size:19px;font-weight:700;color:#0f172a">${dto.empresaNombre}</div>
    </div>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px">${saludo}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px">${cuerpo}</p>
    <div style="background:#f3f4f6;border-radius:8px;padding:14px 18px;margin-bottom:22px">
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Documento adjunto</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${dto.tipoDocumento}</div>
      <div style="font-size:13px;color:#555">N° ${dto.numeroDocumento}</div>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0">
      Este correo fue enviado por ${dto.empresaNombre} a través de StockPro. Si usted no esperaba este mensaje, puede ignorarlo.
    </p>
  </div>
</body></html>`;

    const text = `${saludo}\n\n${cuerpo}\n\nDocumento adjunto: ${dto.tipoDocumento} N° ${dto.numeroDocumento}\n\n— ${dto.empresaNombre} (enviado a través de StockPro)`;

    return { html, text };
  }

  async enviarDocumento(dto: {
    destinatarioEmail: string;
    destinatarioNombre?: string;
    asunto: string;
    mensaje?: string;
    tipoDocumento: string;
    empresaNombre?: string;
    html: string;
    numeroDocumento: string;
  }) {
    const transporter = this.getTransporter();
    const pdfBuffer = await this.renderizarPdf(dto.html);

    const nombreRemitente = process.env.SMTP_FROM_NAME || 'StockPro';
    const emailRemitente = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const empresaNombre = dto.empresaNombre || nombreRemitente;
    const cuerpo = this.armarCuerpoCorreo({ ...dto, empresaNombre });

    try {
      await transporter.sendMail({
        from: `"${nombreRemitente}" <${emailRemitente}>`,
        to: dto.destinatarioNombre ? `"${dto.destinatarioNombre}" <${dto.destinatarioEmail}>` : dto.destinatarioEmail,
        subject: dto.asunto,
        text: cuerpo.text,
        html: cuerpo.html,
        attachments: [{ filename: `${dto.numeroDocumento}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    } catch (err: any) {
      this.logger.error(`Falló el envío de ${dto.numeroDocumento} a ${dto.destinatarioEmail}`, err?.stack ?? String(err));
      throw new InternalServerErrorException('No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
    }

    this.logger.log(`Documento ${dto.numeroDocumento} enviado por correo a ${dto.destinatarioEmail}`);
    return { enviado: true };
  }

  /** Evita procesos de Chromium huérfanos al reiniciar Nest (--watch en dev recarga este provider seguido). */
  async onModuleDestroy() {
    if (this.browser) await this.browser.close().catch(() => {});
  }
}
