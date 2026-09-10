import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { assertExists } from '../../common/utils/assert-exists.util';
import { relanzarP2002 } from '../../common/utils/prisma-error.util';
import { assertCuposUsuarioDisponibles } from '../../common/utils/plan-limits.util';
import { sembrarReglasAprobacion } from '../../common/aprobacion-procesos';
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

// Datos que el panel del SuperAdmin ve/edita de los usuarios de gobierno
// (Owner / Admin del Negocio) — nunca passwordHash.
const SELECT_USUARIO_GOBIERNO = {
  id: true, nombre: true, email: true, activo: true, telefono: true, documento: true, cargo: true,
} as const;

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
      orderBy: { createdAt: 'desc' },
    });

    // La tabla `usuarios` tiene Row-Level Security por tenant
    // (prisma/sql/enable_rls_fase1.sql): sin `app.current_tenant` fijado, la
    // policy filtra TODAS las filas. El panel del SuperAdmin no corre dentro de
    // un tenant, así que un `usuario.findMany` abierto devolvía siempre vacío
    // (owner nulo, admin nulo, contador de usuarios en 0). Los usuarios de
    // gobierno (Owner obligatorio + Admin del Negocio opcional) se leen empresa
    // por empresa dentro de withTenant(). Universo acotado (decenas de
    // negocios, sin paginación server-side todavía) → el costo N es aceptable.
    const gobierno = await Promise.all(
      empresas.map((e) =>
        this.prisma
          .withTenant(e.id, async (tx) => ({
            usuarioOwner: await tx.usuario.findFirst({
              where: { rol: { is: { codigo: 'owner' } } },
              orderBy: { createdAt: 'asc' },
              select: SELECT_USUARIO_GOBIERNO,
            }),
            usuarios: await tx.usuario.findMany({
              where: { rol: { is: { codigo: 'admin' } } },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: SELECT_USUARIO_GOBIERNO,
            }),
          }))
          .catch(() => ({ usuarioOwner: null, usuarios: [] as unknown[] }))
          .then((g) => [e.id, g] as const),
      ),
    );
    const gobiernoPorEmpresa = new Map(gobierno);

    return empresas.map((e) => {
      const g = gobiernoPorEmpresa.get(e.id) ?? { usuarioOwner: null, usuarios: [] };
      return {
        ...e,
        usuarios: g.usuarios,
        estadoEfectivo: calcularEstadoEfectivo(e),
        usuarioOwner: g.usuarioOwner ?? null,
      };
    });
  }

  async findOne(id: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Negocio no encontrado');

    // `usuarios` y `auditoria` tienen RLS por tenant: sin `app.current_tenant`
    // fijado (el panel del SuperAdmin no corre dentro de un tenant) la policy
    // filtra toda fila. Sin esto, el modal "Editar Negocio" mostraba el
    // Propietario / Admin del Negocio en blanco y "Usuarios" en 0 aunque los
    // datos SÍ estaban guardados. Se lee todo dentro de un único withTenant();
    // el detalle del negocio nunca debe romperse si el bloque tenant falla.
    const scoped = await this.prisma
      .withTenant(id, async (tx) => {
        const usuarioOwner = await tx.usuario.findFirst({
          where: { rol: { is: { codigo: 'owner' } } },
          orderBy: { createdAt: 'asc' },
          select: SELECT_USUARIO_GOBIERNO,
        });
        const usuarios = await tx.usuario.findMany({
          where: { rol: { is: { codigo: 'admin' } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: SELECT_USUARIO_GOBIERNO,
        });
        const totalUsuarios = await tx.usuario.count();
        // Último acceso — mejor esfuerzo desde la Bitácora del propio tenant.
        const acceso = await tx.auditoria
          .findFirst({
            where: { accion: 'LOGIN' },
            orderBy: { timestamp: 'desc' },
            select: { timestamp: true },
          })
          .catch(() => null);
        return { usuarioOwner, usuarios, totalUsuarios, ultimoAcceso: acceso?.timestamp ?? null };
      })
      .catch(() => ({ usuarioOwner: null, usuarios: [] as unknown[], totalUsuarios: 0, ultimoAcceso: null }));

    return {
      ...empresa,
      _count: { usuarios: scoped.totalUsuarios },
      usuarios: scoped.usuarios,
      estadoEfectivo: calcularEstadoEfectivo(empresa),
      ultimoAcceso: scoped.ultimoAcceso,
      usuarioOwner: scoped.usuarioOwner,
    };
  }

  /**
   * "Vista 360°": todo lo relevante de un negocio en un solo objeto —
   * identidad + plan/vigencia + equipo/cupo + ingresos (renovaciones) +
   * facturación + backups + señales que requieren atención. Agrega desde los
   * modelos de los demás módulos; es de solo lectura.
   */
  async vista360(id: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Negocio no encontrado');

    const estadoEf = calcularEstadoEfectivo(empresa);
    const diasVenc = empresa.fechaVencimiento
      ? Math.ceil((empresa.fechaVencimiento.getTime() - Date.now()) / 86_400_000)
      : null;

    const [plan, renovaciones, facturasAgg, ultimoRespaldo, totalRespaldos, restauracionesPendientes] = await Promise.all([
      empresa.plan ? this.prisma.planSaaS.findUnique({ where: { id: empresa.plan } }) : null,
      this.prisma.renovacionPlan.findMany({ where: { empresaId: id }, orderBy: { fechaPago: 'desc' }, take: 6 }),
      this.prisma.facturaSaaS.groupBy({ by: ['estado'], where: { empresaId: id }, _sum: { total: true }, _count: true, orderBy: { estado: 'asc' } }),
      this.prisma.respaldoNegocio.findFirst({ where: { empresaId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, estado: true, formato: true, origen: true, integridad: true } }),
      this.prisma.respaldoNegocio.count({ where: { empresaId: id } }),
      this.prisma.solicitudRestauracion.count({ where: { empresaId: id, estado: { in: ['PENDIENTE_APROBACION', 'APROBADA', 'EN_EJECUCION'] } } }),
    ]);

    // Equipo + cupo (RLS: leer dentro de withTenant)
    const equipo = await this.prisma
      .withTenant(id, async (tx) => {
        const [owner, adminNeg, usuariosActivos, totalUsuarios, ultimoAcceso] = await Promise.all([
          tx.usuario.findFirst({ where: { rol: { is: { codigo: 'owner' } } }, orderBy: { createdAt: 'asc' }, select: SELECT_USUARIO_GOBIERNO }),
          tx.usuario.findFirst({ where: { rol: { is: { codigo: 'admin' } } }, orderBy: { createdAt: 'asc' }, select: SELECT_USUARIO_GOBIERNO }),
          tx.usuario.count({ where: { activo: true } }),
          tx.usuario.count(),
          tx.auditoria.findFirst({ where: { accion: 'LOGIN' }, orderBy: { timestamp: 'desc' }, select: { timestamp: true } }).catch(() => null),
        ]);
        return { owner, adminNeg, usuariosActivos, totalUsuarios, ultimoAcceso: ultimoAcceso?.timestamp ?? null };
      })
      .catch(() => ({ owner: null, adminNeg: null, usuariosActivos: 0, totalUsuarios: 0, ultimoAcceso: null }));

    const num = (v: unknown) => Number(v ?? 0);
    const bucket = (e: string) => {
      const r = facturasAgg.find((x) => x.estado === e);
      return { total: num(r?._sum.total), count: r?._count ?? 0 };
    };
    const facEmitida = bucket('EMITIDA');
    const facPagada = bucket('PAGADA');
    const ahoraVencidas = await this.prisma.facturaSaaS.aggregate({
      where: { empresaId: id, estado: 'EMITIDA', venceEn: { lt: new Date() } },
      _sum: { total: true },
      _count: true,
    });

    const ultRenov = renovaciones[0] ?? null;
    const ciclo = ultRenov?.ciclo ?? 'mensual';
    const mrr = ultRenov
      ? ciclo === 'anual'
        ? num(ultRenov.monto) / 12
        : num(ultRenov.monto)
      : plan
        ? num(plan.precioMensual)
        : 0;

    const cupoMax = plan?.maxUsuarios ?? -1;
    const cupoUsado = equipo.usuariosActivos;

    // ── Señales (solo lo que requiere atención) ──
    const senales: Array<{ tipo: string; nivel: 'critica' | 'alta' | 'media'; texto: string }> = [];
    if (estadoEf === 'vencido') senales.push({ tipo: 'plan', nivel: 'critica', texto: 'Plan vencido — acceso bloqueado o por bloquearse' });
    else if (estadoEf === 'gracia') senales.push({ tipo: 'plan', nivel: 'alta', texto: 'Plan vencido, en período de gracia' });
    else if (estadoEf === 'por_vencer') senales.push({ tipo: 'plan', nivel: 'media', texto: `El plan vence en ${diasVenc} día(s)` });
    if (cupoMax > 0 && cupoUsado >= cupoMax) senales.push({ tipo: 'cupo', nivel: 'alta', texto: `Cupo de usuarios lleno (${cupoUsado}/${cupoMax})` });
    if (num(ahoraVencidas._sum.total) > 0) senales.push({ tipo: 'facturacion', nivel: 'alta', texto: `${ahoraVencidas._count} factura(s) vencida(s) sin cobrar` });
    const edadBackupD = ultimoRespaldo ? (Date.now() - ultimoRespaldo.createdAt.getTime()) / 86_400_000 : Infinity;
    if (edadBackupD > 7) senales.push({ tipo: 'backup', nivel: 'media', texto: ultimoRespaldo ? `Último respaldo hace ${Math.round(edadBackupD)} días` : 'Sin respaldos registrados' });
    if (!empresa.email?.trim()) senales.push({ tipo: 'contacto', nivel: 'media', texto: 'Sin email de contacto' });

    return {
      negocio: {
        id: empresa.id,
        nombre: empresa.nombre,
        codigo: empresa.codigo,
        ruc: empresa.ruc,
        email: empresa.email,
        telefono: empresa.telefono,
        contacto: empresa.contacto,
        estado: empresa.estado,
        estadoEfectivo: estadoEf,
        origen: empresa.origen,
        fechaRegistro: empresa.createdAt,
        fechaVencimiento: empresa.fechaVencimiento,
        diasVencimiento: diasVenc,
        ultimoAcceso: equipo.ultimoAcceso,
      },
      plan: plan
        ? { id: plan.id, nombre: plan.nombre, color: plan.color, precioMensual: num(plan.precioMensual), precioAnual: num(plan.precioAnual), moneda: plan.moneda, ciclo, modulos: plan.modulosIncluidos.length }
        : null,
      equipo: {
        owner: equipo.owner,
        adminNegocio: equipo.adminNeg,
        totalUsuarios: equipo.totalUsuarios,
        cupoUsado,
        cupoMax,
        cupoPct: cupoMax > 0 ? Math.min(100, Math.round((cupoUsado / cupoMax) * 100)) : null,
      },
      ingresos: {
        mrr: Math.round(mrr * 100) / 100,
        totalRenovaciones: renovaciones.length,
        ultimaRenovacion: ultRenov
          ? { fecha: ultRenov.fechaPago, monto: num(ultRenov.monto), moneda: ultRenov.moneda, metodoPago: ultRenov.metodoPago, ciclo: ultRenov.ciclo }
          : null,
      },
      facturacion: {
        facturado: Math.round((facEmitida.total + facPagada.total) * 100) / 100,
        cobrado: Math.round(facPagada.total * 100) / 100,
        porCobrar: Math.round(facEmitida.total * 100) / 100,
        vencido: Math.round(num(ahoraVencidas._sum.total) * 100) / 100,
        emitidas: facEmitida.count,
      },
      backups: {
        ultimoRespaldo: ultimoRespaldo
          ? { fecha: ultimoRespaldo.createdAt, estado: ultimoRespaldo.estado, integridad: ultimoRespaldo.integridad, formato: ultimoRespaldo.formato, origen: ultimoRespaldo.origen }
          : null,
        totalRespaldos,
        restauracionesPendientes,
      },
      senales,
    };
  }

  /**
   * Crea la Empresa Y sus usuarios de gobierno en una sola transacción
   * (docs/GOBIERNO-PLATAFORMA.md regla 3):
   *  - Propietario / Admin Owner (rol 'owner') — SIEMPRE, mínimo un Propietario.
   *  - Administrador del Negocio / Admin Tenant (rol 'admin') — OPCIONAL, el
   *    segundo y último usuario de gobierno.
   * Sin al menos el Propietario, el negocio quedaría sin nadie que pueda entrar.
   */
  async create(dto: CreateNegocioDto) {
    if (dto.plan) await this.validarPlan(dto.plan);

    const rolOwner = await this.prisma.rol.findFirst({
      where: { empresaId: null, codigo: 'owner' },
    });
    if (!rolOwner) {
      throw new BadRequestException(
        'No se encontró el rol base "owner" — corre el seed antes de crear negocios',
      );
    }

    // Admin Tenant opcional — si viene uno de los 3 campos, se exigen los 3.
    const quiereAdmin = !!(dto.adminNombre || dto.adminEmail || dto.adminPassword);
    let rolAdmin: { id: string } | null = null;
    if (quiereAdmin) {
      if (!dto.adminNombre || !dto.adminEmail || !dto.adminPassword) {
        throw new BadRequestException(
          'Para registrar el Administrador del Negocio deben enviarse nombre, email y contraseña.',
        );
      }
      rolAdmin = await this.prisma.rol.findFirst({ where: { empresaId: null, codigo: 'admin' } });
      if (!rolAdmin) {
        throw new BadRequestException('No se encontró el rol base "admin" — corre el seed antes de crear negocios');
      }
    }

    const ownerPasswordHash = await bcrypt.hash(dto.ownerPassword, 12);
    const adminPasswordHash = quiereAdmin ? await bcrypt.hash(dto.adminPassword!, 12) : null;

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

        // #11b: reglas de aprobación por proceso en su valor por defecto
        // (la migración cubre las empresas previas; esto, las nuevas).
        await sembrarReglasAprobacion(tx, empresa.id);

        // Regla 3/5: cada cuenta activa ocupa un cupo del plan.
        await assertCuposUsuarioDisponibles(tx as PrismaClient, empresa.id, quiereAdmin ? 2 : 1);

        const usuarioOwner = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            nombre: dto.ownerNombre,
            email: dto.ownerEmail,
            passwordHash: ownerPasswordHash,
            rolId: rolOwner.id,
            telefono: dto.ownerTelefono,
            documento: dto.ownerDocumento,
            cargo: dto.ownerCargo,
          },
          select: { id: true, nombre: true, email: true }, // nunca se devuelve passwordHash
        });

        let usuarioAdmin: { id: string; nombre: string; email: string } | null = null;
        if (quiereAdmin && rolAdmin) {
          usuarioAdmin = await tx.usuario.create({
            data: {
              empresaId: empresa.id,
              nombre: dto.adminNombre!,
              email: dto.adminEmail!,
              passwordHash: adminPasswordHash!,
              rolId: rolAdmin.id,
              telefono: dto.adminTelefono,
              documento: dto.adminDocumento,
              cargo: dto.adminCargo,
            },
            select: { id: true, nombre: true, email: true },
          });
        }

        return { ...empresa, usuarioOwner, usuarioAdminInicial: usuarioAdmin };
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
    if (dto.adminTelefono !== undefined) datosAdmin.telefono = dto.adminTelefono;
    if (dto.adminDocumento !== undefined) datosAdmin.documento = dto.adminDocumento;
    if (dto.adminCargo !== undefined) datosAdmin.cargo = dto.adminCargo;
    if (dto.adminActivo !== undefined) datosAdmin.activo = dto.adminActivo;
    if (dto.adminPassword) datosAdmin.passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    const datosOwner: Record<string, unknown> = {};
    if (dto.ownerNombre !== undefined) datosOwner.nombre = dto.ownerNombre;
    if (dto.ownerEmail !== undefined) datosOwner.email = dto.ownerEmail;
    if (dto.ownerTelefono !== undefined) datosOwner.telefono = dto.ownerTelefono;
    if (dto.ownerDocumento !== undefined) datosOwner.documento = dto.ownerDocumento;
    if (dto.ownerCargo !== undefined) datosOwner.cargo = dto.ownerCargo;
    if (dto.ownerActivo !== undefined) datosOwner.activo = dto.ownerActivo;
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
      select: { id: true, activo: true },
    });

    const activoPedido = opts.datos.activo as boolean | undefined;

    if (usuarioExistente) {
      // Reactivar una cuenta también consume un cupo del plan.
      if (activoPedido === true && usuarioExistente.activo === false) {
        await assertCuposUsuarioDisponibles(tx as unknown as PrismaClient, opts.empresaId, 1);
      }
      await tx.usuario.update({ where: { id: usuarioExistente.id }, data: opts.datos });
      return;
    }

    // El usuario no existe. Si tampoco vino ninguna credencial (solo llegaron
    // datos de perfil sueltos), no hay nada que crear — se ignora en silencio.
    const intentaCrear = !!(opts.nombre || opts.email || opts.password);
    if (!intentaCrear) return;

    if (!opts.nombre || !opts.email || !opts.password) {
      throw new BadRequestException(
        `Para crear el usuario ${opts.etiqueta} del negocio deben enviarse nombre, email y contraseña.`,
      );
    }

    const rol = await tx.rol.findFirst({ where: { empresaId: null, codigo: opts.codigoRol } });
    if (!rol) {
      throw new NotFoundException(`No existe el rol base "${opts.codigoRol}" para crear el usuario ${opts.etiqueta}`);
    }

    // Cuenta nueva activa (default true salvo que se pida false) → consume cupo.
    if (activoPedido !== false) {
      await assertCuposUsuarioDisponibles(tx as unknown as PrismaClient, opts.empresaId, 1);
    }

    const passwordHash = await bcrypt.hash(opts.password, 12);
    await tx.usuario.create({
      data: {
        empresaId: opts.empresaId, nombre: opts.nombre, email: opts.email, passwordHash, rolId: rol.id,
        telefono: opts.datos.telefono as string | undefined,
        documento: opts.datos.documento as string | undefined,
        cargo: opts.datos.cargo as string | undefined,
        ...(activoPedido !== undefined && { activo: activoPedido }),
      },
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
