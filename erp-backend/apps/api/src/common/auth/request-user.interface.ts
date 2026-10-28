/**
 * Shape estable para módulos de negocio (erp/*).
 * NO reemplaza el JWT ni los guards: solo adapta `req.user` existente.
 *
 * Origen JWT (JwtStrategy.validate):
 *   { userId: payload.sub, email: payload.username, roleId: payload.roleId }
 *
 * `roleId` es el rol global legado de sis_usuario. No autoriza una empresa.
 * El rol empresarial sale de cli_usuario_unidad en PermissionsGuard.
 */
export interface RequestUser {
  idUsuario: number;
  correo: string;
  idRol: number;
  /** Presente cuando exista contexto de sucursal en sesión (fases posteriores). */
  idSucursal?: number;
}

/** Forma cruda que deja Passport en `req.user` tras validar el JWT. */
export interface JwtRequestUser {
  userId: number;
  email: string;
  roleId: number;
  /** Sesión de cli_sesion. Ausente en access tokens emitidos antes de la Fase 2E-2. */
  sid?: string | null;
  idSucursal?: number;
}
