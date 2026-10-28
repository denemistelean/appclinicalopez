import { readFileSync } from 'fs';
import { join } from 'path';

describe('entrada Passenger', () => {
  const appJs = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'app.js'), 'utf8');
  const escucha = readFileSync(join(__dirname, '../http/escucha.ts'), 'utf8');

  it('carga main.js junto a app.js y no activa Passenger por una variable', () => {
    expect(appJs).toContain("require('./main.js')");
    expect(appJs).toContain('PhusionPassenger');
    expect(appJs).not.toContain('process.env.PASSENGER');
    expect(appJs).not.toContain("listen('passenger')");
    expect(escucha).toContain('PhusionPassenger');
    expect(escucha).not.toContain('process.env.PASSENGER');
  });
});
