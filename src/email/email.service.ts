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

  async enviarDocumento(dto: {
    destinatarioEmail: string;
    destinatarioNombre?: string;
    asunto: string;
    mensaje?: string;
    html: string;
    numeroDocumento: string;
  }) {
    const transporter = this.getTransporter();
    const pdfBuffer = await this.renderizarPdf(dto.html);

    const nombreRemitente = process.env.SMTP_FROM_NAME || 'StockPro';
    const emailRemitente = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

    try {
      await transporter.sendMail({
        from: `"${nombreRemitente}" <${emailRemitente}>`,
        to: dto.destinatarioNombre ? `"${dto.destinatarioNombre}" <${dto.destinatarioEmail}>` : dto.destinatarioEmail,
        subject: dto.asunto,
        text: dto.mensaje || `Adjunto encontrará el documento ${dto.numeroDocumento}.`,
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
