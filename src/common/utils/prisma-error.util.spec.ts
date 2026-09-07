import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { esErrorUnicidad, mensajeP2002, relanzarP2002 } from './prisma-error.util';

const MAPA = {
  codigo: 'Código repetido',
  ruc: 'RUC repetido',
  email: 'Email repetido',
};

describe('prisma-error.util', () => {
  describe('esErrorUnicidad', () => {
    it('reconoce P2002 y descarta cualquier otro error', () => {
      expect(esErrorUnicidad({ code: 'P2002' })).toBe(true);
      expect(esErrorUnicidad({ code: 'P2025' })).toBe(false);
      expect(esErrorUnicidad(new Error('boom'))).toBe(false);
      expect(esErrorUnicidad(undefined)).toBe(false);
    });
  });

  describe('mensajeP2002', () => {
    it('nombra el campo cuando meta.target es un array de campos (Prisma/Postgres)', () => {
      expect(mensajeP2002({ code: 'P2002', meta: { target: ['ruc'] } }, MAPA)).toBe('RUC repetido');
    });

    it('tolera el nombre crudo del constraint (empresas_ruc_key)', () => {
      expect(mensajeP2002({ code: 'P2002', meta: { target: 'empresas_ruc_key' } }, MAPA)).toBe(
        'RUC repetido',
      );
    });

    it('cae al mensaje por defecto si no hay match', () => {
      expect(mensajeP2002({ code: 'P2002', meta: { target: ['otro'] } }, MAPA, 'defecto')).toBe(
        'defecto',
      );
      expect(mensajeP2002({ code: 'P2002' }, MAPA, 'defecto')).toBe('defecto');
    });

    it('respeta el orden del mapa cuando el target trae varios campos', () => {
      expect(mensajeP2002({ code: 'P2002', meta: { target: ['email', 'codigo'] } }, MAPA)).toBe(
        'Código repetido',
      );
    });
  });

  describe('relanzarP2002', () => {
    it('convierte un P2002 en BadRequestException con el mensaje del campo', () => {
      expect(() => relanzarP2002({ code: 'P2002', meta: { target: ['codigo'] } }, MAPA)).toThrow(
        BadRequestException,
      );
      try {
        relanzarP2002({ code: 'P2002', meta: { target: ['codigo'] } }, MAPA);
      } catch (e) {
        expect((e as BadRequestException).message).toBe('Código repetido');
      }
    });

    it('relanza cualquier otro error sin tocarlo', () => {
      const original = new Error('otra cosa');
      expect(() => relanzarP2002(original, MAPA)).toThrow(original);
    });
  });
});
