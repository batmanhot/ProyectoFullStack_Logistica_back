import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { validateJwtSecrets } from './common/utils/validate-secrets.util';

async function bootstrap() {
  // Hallazgo Crítico #5 (auditoría 2026-07-29): falla el arranque en vez de
  // servir tráfico si algún secreto JWT quedó en su valor de plantilla.
  validateJwtSecrets();

  // Hallazgo Medio #14 (auditoría 2026-07-29): en producción, no caer en
  // silencio a un origin de desarrollo si falta la variable — fallar fuerte.
  if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL no está definida — obligatoria en producción para configurar CORS correctamente.');
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Hallazgo Bajo #17 (auditoría 2026-07-29): sin esto, detrás de un
    // proxy/balanceador request.ip refleja al proxy, no al cliente real
    // (afecta IPs de auditoría y las claves de rate limiting del Hallazgo #4).
    new FastifyAdapter({ trustProxy: true }),
  );

  // Hallazgo Alto #9 (auditoría 2026-07-29): cabeceras de seguridad HTTP
  // (HSTS, X-Content-Type-Options, X-Frame-Options, CSP básica, etc.) —
  // antes no había ninguna.
  await app.register(fastifyHelmet, {
    // La API es JSON puro, no sirve HTML propio — CSP restrictiva por defecto
    // ya cubre el caso; se desactiva crossOriginResourcePolicy porque el
    // frontend (otro origin) sí debe poder leer las respuestas.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Todas las rutas del contrato (sección 6) están bajo /api/...
  app.setGlobalPrefix('api');

  // Contrato de API obligatorio: { data, error } en TODAS las rutas (sección 6.1).
  // HttpExceptionFilter ahora se registra como APP_FILTER en IncidenciasModule
  // (necesita inyección de IncidenciasService para persistir cada 500).
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  // Reglas de negocio declarativas vía DTOs (sección 5/12.6 de la especificación).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,   // elimina campos no declarados en el DTO (seguridad)
      transform: true,
      // forbidNonWhitelisted eliminado: el frontend puede enviar campos extra de la
      // respuesta API (createdAt, updatedAt, relaciones) y el backend los descarta
      // silenciosamente gracias a whitelist:true, sin lanzar error.
    }),
  );

  app.enableCors({
    // Sin FRONTEND_URL seteada, cae a un origin fijo conocido (mismo valor de
    // .env.example) en vez de `true` (Fastify lo interpreta como "reflejar
    // cualquier origin de la request", que con credentials:true equivale a
    // CORS abierto).
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    // Fastify: procesar CORS en onRequest, antes de que corran los guards de NestJS.
    hook: 'onRequest',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 StockPro API (Fase 1+2+3) escuchando en http://localhost:${port}`);
}

bootstrap();
