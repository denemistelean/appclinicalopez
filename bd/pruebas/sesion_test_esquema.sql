-- Esquema mínimo sintético para probar login, refresh, logout y el rol por empresa.
-- Sin USE. El cliente debe estar en app_clinica_lopez_sesion_test.
-- No copia filas de la base clínica.

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- El login busca el usuario con sis_usuario_obtener_por_correo, que une sis_rol.
CREATE TABLE IF NOT EXISTS `sis_rol` (
  `id_rol` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(50) NOT NULL,
  `descripcion` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `uk_sis_rol_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Credenciales y estado. El rol de esta tabla es el legado del JWT y no autoriza la empresa.
-- No incluye primera_sesion: esa columna no existe en el esquema clínico y el login tolera el fallo.
CREATE TABLE IF NOT EXISTS `sis_usuario` (
  `id_usuario` INT NOT NULL AUTO_INCREMENT,
  `id_rol` INT NOT NULL,
  `nombres` VARCHAR(100) NOT NULL,
  `apellidos` VARCHAR(100) NOT NULL,
  `correo` VARCHAR(150) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  `fecha_registro` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uk_sis_usuario_correo` (`correo`),
  KEY `idx_sis_usuario_rol` (`id_rol`),
  CONSTRAINT `fk_sis_usuario_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Empresas de la membresía. opera_finanzas solo se lee; esta fase no escribe finanzas.
CREATE TABLE IF NOT EXISTS `cli_unidad` (
  `id_unidad` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `opera_finanzas` TINYINT(1) NOT NULL DEFAULT 0,
  `estado` ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_unidad`),
  UNIQUE KEY `uk_cli_unidad_codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Membresía y rol por empresa. La usa el login y el guard de permisos.
CREATE TABLE IF NOT EXISTS `cli_usuario_unidad` (
  `id_usuario_unidad` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `id_unidad` INT NOT NULL,
  `id_rol` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_usuario_unidad`),
  KEY `idx_cli_usuario_unidad_usuario` (`id_usuario`),
  KEY `idx_cli_usuario_unidad_unidad` (`id_unidad`),
  KEY `idx_cli_usuario_unidad_rol` (`id_rol`),
  CONSTRAINT `fk_cli_usuario_unidad_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`),
  CONSTRAINT `fk_cli_usuario_unidad_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`),
  CONSTRAINT `fk_cli_usuario_unidad_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Catálogo que consulta PermissionsGuard al entrar a /usuarios.
CREATE TABLE IF NOT EXISTS `sis_modulo` (
  `id_modulo` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(50) NOT NULL,
  `etiqueta` VARCHAR(100) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_modulo`),
  UNIQUE KEY `uk_sis_modulo_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sis_accion` (
  `id_accion` INT NOT NULL AUTO_INCREMENT,
  `id_modulo` INT NOT NULL,
  `codigo_accion` VARCHAR(50) NOT NULL,
  `descripcion` VARCHAR(200) NOT NULL,
  `tipo_operacion` ENUM('CREATE','READ','UPDATE','DELETE','SPECIAL') NOT NULL DEFAULT 'READ',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_accion`),
  KEY `idx_sis_accion_modulo` (`id_modulo`),
  CONSTRAINT `fk_sis_accion_modulo` FOREIGN KEY (`id_modulo`) REFERENCES `sis_modulo` (`id_modulo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sis_permiso` (
  `id_permiso` INT NOT NULL AUTO_INCREMENT,
  `id_rol` INT NOT NULL,
  `id_accion` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_permiso`),
  KEY `idx_sis_permiso_rol` (`id_rol`),
  KEY `idx_sis_permiso_accion` (`id_accion`),
  CONSTRAINT `fk_permiso_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`),
  CONSTRAINT `fk_permiso_accion` FOREIGN KEY (`id_accion`) REFERENCES `sis_accion` (`id_accion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Cambio de clave y baja registran auditoría. El fallo de esta tabla no revierte la clave,
-- pero el servicio igual la escribe y la prueba debe poder completarla.
CREATE TABLE IF NOT EXISTS `sis_auditoria` (
  `id_auditoria` INT NOT NULL AUTO_INCREMENT,
  `nombre_tabla` VARCHAR(50) NOT NULL,
  `id_registro` INT NOT NULL,
  `accion` ENUM('CREAR','ACTUALIZAR','ELIMINAR','ANULAR') NOT NULL,
  `id_usuario` INT NOT NULL,
  `valores_antiguos` LONGTEXT NULL,
  `valores_nuevos` LONGTEXT NULL,
  `fecha` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_auditoria`),
  KEY `idx_sis_auditoria_usuario` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO sis_rol (id_rol, nombre, descripcion, estado_registro) VALUES
  (1, 'LEGACY_GLOBAL', 'Rol global del JWT. No autoriza una empresa.', 'ACTIVO'),
  (2, 'ROL_EMPRESA_A', 'Puede ver y dar de baja usuarios en la empresa A.', 'ACTIVO'),
  (3, 'ROL_EMPRESA_B', 'No puede listar usuarios en la empresa B.', 'ACTIVO');

INSERT INTO sis_modulo (id_modulo, nombre, etiqueta, estado_registro) VALUES
  (1, 'USUARIOS', 'Usuarios de prueba', 'ACTIVO');

INSERT INTO sis_accion (id_accion, id_modulo, codigo_accion, descripcion, tipo_operacion, estado_registro) VALUES
  (1, 1, 'ver_usuario', 'Listar usuarios', 'READ', 'ACTIVO'),
  (2, 1, 'eliminar_usuario', 'Dar de baja un usuario', 'DELETE', 'ACTIVO');

INSERT INTO sis_permiso (id_rol, id_accion, estado_registro) VALUES
  (2, 1, 'ACTIVO'),
  (2, 2, 'ACTIVO');

INSERT INTO cli_unidad (id_unidad, codigo, nombre, opera_finanzas, estado, estado_registro) VALUES
  (1, 'EMP_A', 'Empresa A de prueba', 0, 'ACTIVA', 'ACTIVO'),
  (2, 'EMP_B', 'Empresa B de prueba', 1, 'ACTIVA', 'ACTIVO');

DROP PROCEDURE IF EXISTS sis_usuario_obtener_por_correo;
DROP PROCEDURE IF EXISTS sis_usuario_obtener;
DROP PROCEDURE IF EXISTS sis_usuario_eliminar;
DROP PROCEDURE IF EXISTS sis_usuario_listar;
DROP PROCEDURE IF EXISTS sis_rol_listar;
