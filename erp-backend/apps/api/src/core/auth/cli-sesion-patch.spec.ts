import * as fs from 'fs';
import * as path from 'path';

const raiz = path.resolve(__dirname, '../../../../../../');
const parche = path.join(raiz, 'bd', 'patches', '034_cli_sesion.sql');
const variante = path.join(raiz, 'bd', 'pruebas', '034_cli_sesion_sin_use.sql');

function ejecutable(sql: string): string {
  const sinBloque = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const sinLinea = sinBloque
    .split(/\r?\n/)
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
  return sinLinea.replace(/\s+/g, ' ').trim();
}

describe('Parche 034 — sin cambio de base', () => {
  const produccion = fs.readFileSync(parche, 'utf8');
  const prueba = fs.readFileSync(variante, 'utf8');
  const sql = ejecutable(produccion);

  it('no selecciona otra base al importarse', () => {
    expect(sql).not.toMatch(/\bUSE\b/i);
    expect(sql).not.toMatch(/app_clinica_lopez/i);
    expect(sql).not.toMatch(/\bCREATE\s+DATABASE\b/i);
  });

  it('coincide con el DDL que pasó las pruebas reales', () => {
    expect(sql).toBe(ejecutable(prueba));
  });

  it('conserva el esquema probado en MariaDB 10.4', () => {
    expect(sql).toMatch(/ENGINE=InnoDB/i);
    expect(sql).toMatch(/CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci/i);
    expect(sql).toMatch(/`id_sesion` CHAR\(36\) NOT NULL/);
    expect(sql).toMatch(/`hash_refresh` CHAR\(64\) NOT NULL/);
    expect(sql).toMatch(/`fecha_creacion` DATETIME NOT NULL/);
    expect(sql).toMatch(/`vence_en` DATETIME NOT NULL/);
    expect(sql).toMatch(/`fecha_revocacion` DATETIME NULL/);
    expect(sql).toMatch(/`fecha_renovacion` DATETIME NULL/);
    expect(sql).toMatch(/`motivo_revocacion` VARCHAR\(40\) NULL/);
    expect(sql).toMatch(/PRIMARY KEY \(`id_sesion`\)/);
    expect(sql).toMatch(/KEY `idx_cli_sesion_usuario` \(`id_usuario`\)/);
    expect(sql).toMatch(/KEY `idx_cli_sesion_vence` \(`vence_en`\)/);
    expect(sql).toMatch(/CONSTRAINT `fk_cli_sesion_usuario`\s+FOREIGN KEY \(`id_usuario`\) REFERENCES `sis_usuario` \(`id_usuario`\)\s+ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/\bTIMESTAMP\b/i);
    expect(sql).not.toMatch(/utf8mb4_0900/i);
    expect(sql).not.toMatch(/\bINVISIBLE\b/i);
    expect(sql).not.toMatch(/\bRETURNING\b/i);
  });

  it('deja la reversión comentada', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(produccion).toMatch(/--\s*DROP TABLE IF EXISTS `cli_sesion`;/);
  });
});
