/**
 * Base en memoria para pruebas de sesión. No abre MariaDB.
 */
export function crearMemoriaAuth() {
  const sesiones = new Map<string, any>();
  const tails = new Map<string, Promise<void>>();
  const estado = { fallarInsert: false, commits: 0, rollbacks: 0 };

  function adquirir(sid: string): Promise<() => void> {
    const prev = tails.get(sid) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(sid, prev.then(() => gate));
    return prev.then(() => () => release());
  }

  async function query(sql: string, params: any[] = [], alBloquear?: (liberar: () => void) => void) {
    if (/^\s*insert\b/i.test(sql) && sql.includes('cli_sesion')) {
      if (estado.fallarInsert) throw new Error('fallo de sesion');
      sesiones.set(String(params[0]), {
        id_sesion: String(params[0]),
        id_usuario: Number(params[1]),
        hash_refresh: String(params[2]),
        vence_unix: Number(params[3]),
        fecha_revocacion: null,
        motivo_revocacion: null,
      });
      return { affectedRows: 1 };
    }
    if (sql.includes('cli_sesion') && sql.includes('FOR UPDATE')) {
      const sid = String(params[0]);
      const liberar = await adquirir(sid);
      alBloquear?.(liberar);
      const row = sesiones.get(sid);
      return row ? [{ ...row }] : [];
    }
    if (/^\s*update\b/i.test(sql) && sql.includes('cli_sesion') && sql.includes('hash_refresh=?')) {
      const row = sesiones.get(String(params[1]));
      if (!row || row.fecha_revocacion) return { affectedRows: 0 };
      row.hash_refresh = String(params[0]);
      return { affectedRows: 1 };
    }
    if (/^\s*update\b/i.test(sql) && sql.includes('cli_sesion') && sql.includes('motivo_revocacion=?')) {
      const motivo = String(params[0]);
      const marcar = (row: any) => {
        if (row.fecha_revocacion) return false;
        row.fecha_revocacion = 'revocada';
        row.motivo_revocacion = motivo;
        return true;
      };
      if (sql.includes('id_sesion=?') && sql.includes('id_usuario=?')) {
        const row = sesiones.get(String(params[1]));
        const ok = row && Number(row.id_usuario) === Number(params[2]) && marcar(row);
        return { affectedRows: ok ? 1 : 0 };
      }
      if (sql.includes('id_sesion=?')) {
        const row = sesiones.get(String(params[1]));
        return { affectedRows: row && marcar(row) ? 1 : 0 };
      }
      let n = 0;
      for (const row of sesiones.values()) {
        if (Number(row.id_usuario) === Number(params[1]) && marcar(row)) n += 1;
      }
      return { affectedRows: n };
    }
    return null;
  }

  function createQueryRunner() {
    let liberar: (() => void) | null = null;
    const soltar = () => {
      liberar?.();
      liberar = null;
    };
    return {
      connect: async () => undefined,
      startTransaction: async () => undefined,
      commitTransaction: async () => {
        estado.commits += 1;
        soltar();
      },
      rollbackTransaction: async () => {
        estado.rollbacks += 1;
        soltar();
      },
      release: async () => undefined,
      query: async (sql: string, params?: any[]) => query(sql, params || [], (fn) => {
        liberar = fn;
      }),
    };
  }

  return { sesiones, estado, query, createQueryRunner };
}
