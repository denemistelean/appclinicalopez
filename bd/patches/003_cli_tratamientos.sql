-- ==============================================================================
-- PATCH 003 — Tratamientos, paquetes, protocolos + permisos TRATAMIENTOS
-- Completa FK de cli_personal_tratamiento; id_insumo sin FK hasta patch 004
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_tratamiento` (
  `id_tratamiento` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `descripcion` TEXT NULL,
  `categoria` VARCHAR(100) NULL,
  `duracion_minutos` INT NOT NULL DEFAULT 30,
  `precio_base` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `requiere_equipo` TINYINT(1) NOT NULL DEFAULT 0,
  `requiere_sala` TINYINT(1) NOT NULL DEFAULT 1,
  `id_tipo_equipo` INT NULL,
  `intervalo_minutos` INT NULL COMMENT 'Buffer entre citas',
  `estado` ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tratamiento`),
  UNIQUE KEY `uk_cli_tratamiento_codigo` (`codigo`),
  KEY `idx_cli_trat_tipo_equipo` (`id_tipo_equipo`),
  CONSTRAINT `fk_cli_trat_tipo_equipo` FOREIGN KEY (`id_tipo_equipo`) REFERENCES `cli_tipo_equipo` (`id_tipo_equipo`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Catálogo de tratamientos / servicios';

CREATE TABLE IF NOT EXISTS `cli_tratamiento_sede` (
  `id_tratamiento_sede` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `precio` DECIMAL(10,2) NULL COMMENT 'Override de precio_base; NULL = usar base',
  `disponible` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tratamiento_sede`),
  UNIQUE KEY `uk_cli_tratamiento_sede` (`id_tratamiento`, `id_sede`),
  KEY `idx_cli_trat_sede_sede` (`id_sede`),
  CONSTRAINT `fk_cli_trat_sede_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_trat_sede_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Disponibilidad y precio por sede';

CREATE TABLE IF NOT EXISTS `cli_contraindicacion` (
  `id_contraindicacion` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `codigo` VARCHAR(60) NULL,
  `descripcion` VARCHAR(255) NOT NULL,
  `severidad` ENUM('BAJA','MEDIA','ALTA','ABSOLUTA') NOT NULL DEFAULT 'MEDIA',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_contraindicacion`),
  KEY `idx_cli_contraind_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_contraind_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Contraindicaciones asociadas a tratamientos';

-- FK a cli_insumo se agrega en patch 004
CREATE TABLE IF NOT EXISTS `cli_tratamiento_insumo` (
  `id_tratamiento_insumo` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `id_insumo` INT NOT NULL COMMENT 'FK diferida a cli_insumo (patch 004)',
  `cantidad` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `unidad` VARCHAR(30) NULL,
  `obligatorio` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tratamiento_insumo`),
  UNIQUE KEY `uk_cli_trat_insumo` (`id_tratamiento`, `id_insumo`),
  KEY `idx_cli_trat_insumo_insumo` (`id_insumo`),
  CONSTRAINT `fk_cli_trat_insumo_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Insumos consumidos por tratamiento (FEFO en agenda)';

CREATE TABLE IF NOT EXISTS `cli_paquete` (
  `id_paquete` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `descripcion` TEXT NULL,
  `id_tratamiento` INT NULL COMMENT 'Tratamiento principal del paquete',
  `cantidad_sesiones` INT NOT NULL DEFAULT 1,
  `precio_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `vigencia_dias` INT NULL,
  `estado` ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paquete`),
  UNIQUE KEY `uk_cli_paquete_codigo` (`codigo`),
  KEY `idx_cli_paquete_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_paquete_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Paquetes de sesiones / combos';

CREATE TABLE IF NOT EXISTS `cli_protocolo` (
  `id_protocolo` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `descripcion` TEXT NULL,
  `pasos_json` JSON NULL COMMENT 'Pasos ordenados del protocolo clínico',
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_protocolo`),
  KEY `idx_cli_protocolo_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_protocolo_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Protocolos clínicos por tratamiento';

-- Completar FK diferida de certificaciones (patch 002)
SET @fk_pers_trat := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_personal_tratamiento'
    AND CONSTRAINT_NAME = 'fk_cli_pers_trat_tratamiento'
);
SET @sql_pers_trat := IF(@fk_pers_trat = 0,
  'ALTER TABLE `cli_personal_tratamiento` ADD CONSTRAINT `fk_cli_pers_trat_tratamiento` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt_pers_trat FROM @sql_pers_trat;
EXECUTE stmt_pers_trat;
DEALLOCATE PREPARE stmt_pers_trat;

-- ---------- Permisos TRATAMIENTOS ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'TRATAMIENTOS', 'Tratamientos', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'TRATAMIENTOS');

SET @id_mod_trat := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'TRATAMIENTOS' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_trat, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_tratamiento' AS codigo, 'Ver tratamientos' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_tratamiento', 'Crear tratamientos', 'CREATE' UNION ALL
  SELECT 'actualizar_tratamiento', 'Actualizar tratamientos', 'UPDATE' UNION ALL
  SELECT 'eliminar_tratamiento', 'Eliminar tratamientos', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_trat AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_trat AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_trat AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
