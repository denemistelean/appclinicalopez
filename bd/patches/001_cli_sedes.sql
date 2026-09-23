-- ==============================================================================
-- PATCH 001 — Sedes, salas, equipos + permisos SEDES
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_tipo_equipo` (
  `id_tipo_equipo` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tipo_equipo`),
  UNIQUE KEY `uk_cli_tipo_equipo_nombre` (`nombre`)
) ENGINE=InnoDB COMMENT='Catálogo de tipos de equipo';

CREATE TABLE IF NOT EXISTS `cli_sede` (
  `id_sede` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `razon_social` VARCHAR(200) NULL,
  `direccion` VARCHAR(255) NULL,
  `ciudad` VARCHAR(100) NULL,
  `distrito` VARCHAR(100) NULL,
  `telefono` VARCHAR(40) NULL,
  `email_contacto` VARCHAR(150) NULL,
  `horario_apertura` TIME NULL,
  `horario_cierre` TIME NULL,
  `dias_atencion` JSON NULL,
  `logo_url` VARCHAR(255) NULL,
  `estado` ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_sede`)
) ENGINE=InnoDB COMMENT='Sedes / sucursales de la clínica';

CREATE TABLE IF NOT EXISTS `cli_sala` (
  `id_sala` INT NOT NULL AUTO_INCREMENT,
  `id_sede` INT NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `capacidad_equipo` VARCHAR(150) NULL,
  `estado` ENUM('DISPONIBLE','OCUPADA','MANTENIMIENTO','INACTIVA') NOT NULL DEFAULT 'DISPONIBLE',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_sala`),
  KEY `idx_cli_sala_sede` (`id_sede`),
  CONSTRAINT `fk_cli_sala_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `cli_equipo` (
  `id_equipo` INT NOT NULL AUTO_INCREMENT,
  `id_sede` INT NOT NULL,
  `id_tipo_equipo` INT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `tipo` VARCHAR(100) NULL,
  `numero_serie` VARCHAR(100) NULL,
  `fecha_adquisicion` DATE NULL,
  `fecha_ultimo_mantenimiento` DATE NULL,
  `proximo_mantenimiento` DATE NULL,
  `estado` ENUM('OPERATIVO','EN_MANTENIMIENTO','DE_BAJA') NOT NULL DEFAULT 'OPERATIVO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_equipo`),
  KEY `idx_cli_equipo_sede` (`id_sede`),
  CONSTRAINT `fk_cli_equipo_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_equipo_tipo` FOREIGN KEY (`id_tipo_equipo`) REFERENCES `cli_tipo_equipo` (`id_tipo_equipo`) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'SEDES', 'Sedes', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'SEDES');

SET @id_mod_sedes := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'SEDES' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_sedes, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_sede' AS codigo, 'Ver sedes' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_sede', 'Crear sedes', 'CREATE' UNION ALL
  SELECT 'actualizar_sede', 'Actualizar sedes', 'UPDATE' UNION ALL
  SELECT 'eliminar_sede', 'Eliminar sedes', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_sedes AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_sedes AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_sedes AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
