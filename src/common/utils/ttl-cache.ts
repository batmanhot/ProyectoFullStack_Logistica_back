/**
 * Cache en memoria con expiración por entrada. Se usa en los guards de auth
 * para no pegarle a la base en cada request: el estado de la cuenta (activa /
 * tokenVersion) se cachea unos segundos. La revocación real (desactivar un
 * usuario, cerrar sesión) se aplica al vencer el TTL — ventana de ~segundos en
 * vez de los 15 min / 8 h que dura el access token.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { v: V; exp: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.v;
  }

  set(key: string, v: V): void {
    this.store.set(key, { v, exp: Date.now() + this.ttlMs });
    // Purga barata si el mapa crece: recorre y borra expirados.
    if (this.store.size > 5000) {
      const ahora = Date.now();
      for (const [k, e] of this.store) if (ahora > e.exp) this.store.delete(k);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
