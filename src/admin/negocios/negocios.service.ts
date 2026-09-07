import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { assertExists } from '../../common/utils/assert-exists.util';
import { relanzarP2002 } from '../../common/utils/prisma-error.util';
import { DIAS_GRACIA, calcularEstadoEfectivo } from '../estado-negocio.util';

// Índices únicos que puede violar el alta/edición de un negocio — el mensaje
// viejo ("código o RUC") obligaba al SuperAdmin a adivinar cuál repetir, y ni
// mencionaba el email. Se pasa a `relanzarP2002` para nombrar el campo real.
const CONFLICTOS_NEGOCIO: Record<string, string> = {
  codigo: 'Ya existe un negocio con ese código URL (slug). Elige otro.',
  ruc: 'Ya existe un negocio registrado con ese RUC / identificación fiscal.',
  email: 'Ese email ya está en uso por otro usuario del negocio.',
};
const CONFLICTO_NEGOCIO_DEFECTO =
  'Ya existe un negocio con un dato único duplicado (código URL, RUC o email).';

@Injectable()
export class NegociosService {
  private readonly logger = new Logger('NegociosService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A diferencia de TODO el resto del backend, aquí NUNCA se usa
   * withTenant() — un PlatformAdmin ve todas las empresas a la vez.
   * Empresa no tiene RLS (decisión de Fase 1), así que esto es seguro.
   */
  // Nota: filtrar por `estado` acá sigue siendo el campo MANUAL guardado —
  // filtrar por por_vencer/gracia (calculados) se hace en el frontend sobre
  // `estadoEfectivo`, ya que no son valores persistidos que Prisma pueda
  // consultar directamente. Para negocios (universo acotado, no miles) esto
  // es aceptable sin paginación server-side todavía.
  async findAll(filtros: { estado?: string; plan?: string } = {}) {
    const empresas = await this.prisma.empresa.findMany({
      where: {
        ...(filtros.estado && { estado: filtros.estado }),
        ...(filtros.plan && { plan: filtros.plan }),
      },
      include: {
        usuarios: {
          where: { rol: { is: { codigo: 'admin' } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, nombre: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Campo NUEVO y aparte (no toca `usuarios`, que sigue devolviendo solo el
    // Admin de siempre para el panel clásico) — el Admin Owner (regla de
    // gobierno 2026-09-04) se resuelve en una sola query extra, no N+1.
    const owners = await this.prisma.usuario.findMany({
      where: { empresaId: { in: empresas.map((e) => e.id) }, rol: { is: { codigo: 'owner' } } },
      select: { id: true, nombre: true, email: true, empresaId: true },
    });
    const ownerPorEmpresa = new Map(owners.map((o) => [o.empresaId, o]));
    return empresas.map((e) => ({
      ...e,
      estadoEfectivo: calcularEstadoEfectivo(e),
      usuarioOwner: ownerPorEmpresa.get(e.id) ?? null,
    }));
  }

  async findOne(id: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id },
      include: {
        _count: { select: { usuarios: true } },
        usuarios: {
          where: { rol: { is: { codigo: 'admin' } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, nombre: true, email: true },
        },
      },
    });
    if (!empresa) throw new NotFoundException('Negocio no encontrado');

    const usuarioOwner = await this.prisma.usuario.findFirst({
      where: { empresaId: id, rol: { is: { codigo: 'owner' } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nombre: true, email: true },
    });

    // Último acceso — mejor esfuerzo desde la Bitácora del propio tenant
    // (Auditoria tiene RLS: solo se puede leer dentro de withTenant() de ESA
    // empresa puntual, nunca en una consulta abierta). Nunca debe romper el
    // detalle del negocio si falla.
    const ultimoAcceso = await this.prisma
      .withTenant(id, (tx) =>
        tx.auditoria.findFirst({
          where: { accion: 'LOGIN' },
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true },
        }),
      )
      .then((r) => r?.timestamp ?? null)
      .catch(() => null);

    return { ...empresa, estadoEfectivo: calcularEstadoEfectivo(empresa), ultimoAcceso, usuarioOwner };
  }

  /**
   * Crea la Empresa Y su Usuario administrador inicial (rol global 'admin')
   * en una sola transacción — sin esto, un negocio recién creado quedaría
   * sin ningún usuario que pueda iniciar sesión.
   */
  async create(dto: CreateNegocioDto) {
    if (dto.plan) await this.validarPlan(dto.plan);

    const rolAdmin = await this.prisma.rol.findFirst({
      where: { empresaId: null, codigo: 'admin' },
    });
    if (!rolAdmin) {
      throw new BadRequestException(
        'No se encontró el rol base "admin" — corre el seed de Fase 1 antes de crear negocios',
      );
    }

    // Admin Owner opcional (regla de gobierno 2026-09-04) — si se envía
    // cualquiera de los 3 campos, se exigen los 3 y debe existir el rol base.
    const quiereOwner = !!(dto.ownerNombre || dto.ownerEmail || dto.ownerPassword);
    let rolOwner: { id: string } | null = null;
    if (quiereOwner) {
      if (!dto.ownerNombre || !dto.ownerEmail || !dto.ownerPassword) {
        throw new BadRequestException(
          'Para registrar el Admin Owner deben enviarse nombre, email y contraseña.',
        );
      }
      rolOwner = await this.prisma.rol.findFirst({ where: { empresaId: null, codigo: 'owner' } });
      if (!rolOwner) {
        throw new BadRequestException('No se encontró el rol base "owner" — corre el seed antes de crear negocios');
      }
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
    const ownerPasswordHash = quiereOwner ? await bcrypt.hash(dto.ownerPassword!, 12) : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: {
            codigo: dto.codigo.toLowerCase(),
            nombre: dto.nombre,
            nombreCorto: dto.nombreCorto,
            ruc: dto.ruc,
            contacto: dto.contacto,
            email: dto.email,
            telefono: dto.telefono,
            plan: dto.plan ?? 'starter',
            estado: dto.estado, // undefined → Prisma aplica el default de schema ("activo")
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            notas: dto.notas,
            origen: 'admin_saas',
          },
        });

        // Activa el contexto RLS de este tenant recién creado dentro de la
        // MISMA transacción — sin esto, el insert de Usuario de abajo viola
        // la política de Row-Level Security de la tabla `usuarios` (bug real
        // encontrado al probar la creación de un negocio en vivo).
        await this.prisma.activarTenantEnTransaccion(tx as PrismaClient, empresa.id);

        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nombre: dto.adminNombre,
            email: dto.adminEmail,
            passwordHash,
            rolId: rolAdmin.id,
          },
          select: { id: true, nombre: true, email: true }, // nunca se devuelve passwordHash
        });

        let usuarioOwner: { id: string; nombre: string; email: string } | null = null;
        if (quiereOwner && rolOwner) {
          usuarioOwner = await tx.usuario.create({
            data: {
              empresaId: empresa.id,
              nombre: dto.ownerNombre!,
              email: dto.ownerEmail!,
              passwordHash: ownerPasswordHash!,
              rolId: rolOwner.id,
            },
            select: { id: true, nombre: true, email: true },
          });
        }

        return { ...empresa, usuarioAdminInicial: usuario, usuarioOwner };
      });
    } catch (e) {
      relanzarP2002(e, CONFLICTOS_NEGOCIO, CONFLICTO_NEGOCIO_DEFECTO);
    }
  }

  async update(id: string, dto: UpdateNegocioDto) {
    await this.assertEmpresaExiste(id);
    if (dto.plan) await this.validarPlan(dto.plan);

    const activoImplicito =
      dto.activo === undefined && dto.estado !== undefined
        ? ['trial', 'activo'].includes(dto.estado)
        : undefined;

    const datosNegocio: Record<string, unknown> = {
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.nombreCorto !== undefined && { nombreCorto: dto.nombreCorto }),
      ...(dto.ruc !== undefined && { ruc: dto.ruc }),
      ...(dto.contacto !== undefined && { contacto: dto.contacto }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.telefono !== undefined && { telefono: dto.telefono }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.estado !== undefined && { estado: dto.estado }),
      ...(dto.activo !== undefined && { activo: dto.activo }),
      ...(activoImplicito !== undefined && { activo: activoImplicito }),
      ...(dto.fechaVencimiento !== undefined && { fechaVencimiento: new Date(dto.fechaVencimiento) }),
      ...(dto.notas !== undefined && { notas: dto.notas }),
    };

    const datosAdmin: Record<string, unknown> = {};
    if (dto.adminNombre !== undefined) datosAdmin.nombre = dto.adminNombre;
    if (dto.adminEmail !== undefined) datosAdmin.email = dto.adminEmail;
    if (dto.adminPassword) datosAdmin.passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    const datosOwner: Record<string, unknown> = {};
    if (dto.ownerNombre !== undefined) datosOwner.nombre = dto.ownerNombre;
    if (dto.ownerEmail !== undefined) datosOwner.email = dto.ownerEmail;
    if (dto.ownerPassword) datosOwner.passwordHash = await bcrypt.hash(dto.ownerPassword, 12);

    try {
      if (Object.keys(datosAdmin).length === 0 && Object.keys(datosOwner).length === 0) {
        return await this.prisma.empresa.update({
          where: { id },
          data: datosNegocio,
        });
      }

      return await this.prisma.$transaction(async (tx) => {
        await this.prisma.activarTenantEnTransaccion(tx as PrismaClient, id);

        const empresaActualizada = await tx.empresa.update({
          where: { id },
          data: datosNegocio,
        });

        if (Object.keys(datosAdmin).length > 0) {
          await this.upsertUsuarioDeRol(tx, {
            empresaId: id,
            codigoRol: 'admin',
            datos: datosAdmin,
            nombre: dto.adminNombre,
            email: dto.adminEmail,
            password: dto.adminPassword,
            etiqueta: 'administrador',
          });
        }

        if (Object.keys(datosOwner).length > 0) {
          await this.upsertUsuarioDeRol(tx, {
            empresaId: id,
            codigoRol: 'owner',
            datos: datosOwner,
            nombre: dto.ownerNombre,
            email: dto.ownerEmail,
            password: dto.ownerPassword,
            etiqueta: 'Admin Owner',
          });
        }

        return empresaActualizada;
      });
    } catch (e) {
      relanzarP2002(e, CONFLICTOS_NEGOCIO, CONFLICTO_NEGOCIO_DEFECTO);
    }
  }

  /**
   * Actualiza el usuario existente de rol `codigoRol` para este negocio, o lo
   * crea si todavía no existe (ej. agregar un Admin Owner a un negocio viejo
   * que solo tenía el Admin de siempre). Misma lógica que antes tenía
   * `update()` solo para 'admin' — factorizada para reusarla también con
   * 'owner' sin duplicar el flujo completo.
   */
  private async upsertUsuarioDeRol(
    tx: Prisma.TransactionClient,
    opts: {
      empresaId: string;
      codigoRol: string;
      datos: Record<string, unknown>;
      nombre?: string;
      email?: string;
      password?: string;
      etiqueta: string;
    },
  ) {
    const usuarioExistente = await tx.usuario.findFirst({
      where: { empresaId: opts.empresaId, rol: { is: { codigo: opts.codigoRol } } },
      orderBy: { createdAt: 'asc' },
    });

    if (usuarioExistente) {
      await tx.usuario.update({ where: { id: usuarioExistente.id }, data: opts.datos });
      return;
    }

    if (!opts.nombre || !opts.email || !opts.password) {
      throw new BadRequestException(
        `Para crear el usuario ${opts.etiqueta} del negocio deben enviarse nombre, email y contraseña.`,
      );
    }

    const rol = await tx.rol.findFirst({ where: { empresaId: null, codigo: opts.codigoRol } });
    if (!rol) {
      throw new NotFoundException(`No existe el rol base "${opts.codigoRol}" para crear el usuario ${opts.etiqueta}`);
    }

    const passwordHash = await bcrypt.hash(opts.password, 12);
    await tx.usuario.create({
      data: { empresaId: opts.empresaId, nombre: opts.nombre, email: opts.email, passwordHash, rolId: rol.id },
    });
  }

  /**
   * Soft-delete ("Cancelar negocio" en el panel) — reversible: solo cambia
   * estado/activo, nunca borra ningún dato. Distinto de archivar() (ver
   * abajo), que es la vía protegida para "Eliminar definitivamente".
   */
  async remove(id: string) {
    await this.assertEmpresaExiste(id);
    return this.prisma.empresa.update({
      where: { id },
      data: { activo: false, estado: 'cancelado' },
    });
  }

  /**
   * "Eliminar definitivamente" (2026-09-04) — el botón "Eliminar" del panel
   * en realidad solo hacía lo mismo que remove() (soft-delete reversible),
   * pero el diálogo de confirmación decía "esta acción no se puede deshacer"
   * — lenguaje engañoso. Esto es lo que de verdad debería ser irreversible en
   * la práctica: exige re-escribir el nombre EXACTO del negocio (validado acá,
   * no solo en el frontend) y lo deja en un estado final ('archivado') que
   * ninguna edición normal puede revertir. Sigue sin ser un DELETE físico en
   * SQL — arrastrar por cascada toda la data de un tenant (productos,
   * movimientos, despachos...) es un riesgo que excede el alcance de esta
   * fase; 'archivado' ya es irreversible a efectos prácticos del panel.
   */
  async archivar(id: string, confirmacionNombre: string) {
    const empresa = await this.assertEmpresaExiste(id);
    if (empresa.nombre.trim().toLowerCase() !== (confirmacionNombre ?? '').trim().toLowerCase()) {
      throw new BadRequestException(
        'El nombre escrito no coincide exactamente con el del negocio — no se eliminó nada.',
      );
    }
    return this.prisma.empresa.update({
      where: { id },
      data: { activo: false, estado: 'archivado' },
    });
  }

  private async assertEmpresaExiste(id: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Negocio no encontrado');
    return empresa;
  }

  private validarPlan(planId: string) {
    return assertExists(
      () => this.prisma.planSaaS.findUnique({ where: { id: planId } }),
      `El plan "${planId}" no existe en el catálogo de PlanSaaS`,
    );
  }

  /**
   * Recalcula y ASIENTA el estado final 'vencido' (con activo:false) para
   * cualquier negocio automático (no suspendido/cancelado/archivado a mano)
   * cuyo período de gracia ya se agotó — sin importar si es trial o un plan
   * pago. Antes esto solo pasaba para trials, por miedo a cortar a un cliente
   * pagando cuya fecha nadie había actualizado; el período de gracia (ver
   * estado-negocio.util.ts) es justamente lo que hace seguro extenderlo a
   * todos los planes: ya no es un corte instantáneo, hay un margen para que
   * el pago manual (transferencia/Yape) se concilie antes de bloquear.
   * `AuthService.assertEmpresaAccesible` es quien realmente bloquea el login
   * (usa el mismo cálculo de gracia) — este cron solo mantiene el campo
   * `estado`/`activo` (y por lo tanto el panel de AdminSaaS) al día, para no
   * depender de un intento de login para que se refleje.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async actualizarEstadosVencimiento() {
    const limiteGracia = new Date(Date.now() - DIAS_GRACIA * 86_400_000);
    const { count } = await this.prisma.empresa.updateMany({
      where: {
        activo: true,
        estado: { notIn: ['suspendido', 'cancelado', 'archivado'] },
        fechaVencimiento: { lt: limiteGracia },
      },
      data: { activo: false, estado: 'vencido' },
    });
    if (count > 0) {
      this.logger.log(`${count} negocio(s) vencido(s) (gracia agotada) marcados automáticamente.`);
    }
    return count;
  }
}
