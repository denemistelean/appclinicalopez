/** Distingue el JWT de acceso del de renovación. No autoriza la empresa. */
export const TOKEN_USE = {
  access: 'access',
  refresh: 'refresh',
} as const;

export type TokenUse = (typeof TOKEN_USE)[keyof typeof TOKEN_USE];
