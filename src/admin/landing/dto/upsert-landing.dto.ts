import {
  IsNotEmpty,
  IsObject,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * El contenido de la landing es un blob de marketing que el SuperAdmin edita
 * por secciones. No se valida campo por campo (sería frágil), pero sí la FORMA
 * de alto nivel: cada sección conocida debe ser un objeto, `caracteristicas`
 * un array, y el total acotado — así un guardado corrupto no rompe la web
 * pública en silencio.
 */
const SECCIONES_OBJETO = ['sitio', 'hero', 'contacto', 'redesSociales', 'seo', 'footer'];
const SECCIONES_ARRAY = ['caracteristicas'];
const MAX_BYTES = 100_000;

@ValidatorConstraint({ name: 'landingShape', async: false })
class LandingShapeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;

    for (const k of SECCIONES_OBJETO) {
      if (k in obj) {
        const v = obj[k];
        if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
      }
    }
    for (const k of SECCIONES_ARRAY) {
      if (k in obj && !Array.isArray(obj[k])) return false;
    }
    try {
      if (JSON.stringify(obj).length > MAX_BYTES) return false;
    } catch {
      return false; // referencias circulares u otro contenido no serializable
    }
    return true;
  }

  defaultMessage(): string {
    return `Contenido de landing inválido: cada sección (${SECCIONES_OBJETO.join(', ')}) debe ser un objeto, "caracteristicas" un array, y el total < ${MAX_BYTES / 1000} KB.`;
  }
}

export class UpsertLandingDto {
  @IsObject()
  @IsNotEmpty()
  @Validate(LandingShapeConstraint)
  data: Record<string, unknown>;
}
