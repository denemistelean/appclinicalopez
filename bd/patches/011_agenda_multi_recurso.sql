-- ==============================================================================
-- PATCH 011 — Agenda multi-recurso: roles, participantes, penalidad, intervalo días
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_rol_recurso` (
  `id_rol_recurso` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_rol_recurso`),
  UNIQUE KEY `uk_cli_rol_recurso_codigo` (`codigo`)
) ENGINE=InnoDB COMMENT='Roles de recurso clínico (anestesista, enfermera, etc.)';

CREATE TABLE IF NOT EXISTS `cli_personal_rol` (
  `id_personal_rol` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_rol_recurso` INT NOT NULL,
  `vigente_desde` DATE NULL,
  `vigente_hasta` DATE NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_rol`),
  UNIQUE KEY `uk_cli_personal_rol` (`id_personal`, `id_rol_recurso`),
  CONSTRAINT `fk_cli_personal_rol_pers` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_personal_rol_rol` FOREIGN KEY (`id_rol_recurso`) REFERENCES `cli_rol_recurso` (`id_rol_recurso`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Roles vigentes asignados al personal';

CREATE TABLE IF NOT EXISTS `cli_tratamiento_rol_requerido` (
  `id_tratamiento_rol_requerido` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `id_rol_recurso` INT NOT NULL,
  `obligatorio` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tratamiento_rol_requerido`),
  UNIQUE KEY `uk_cli_trat_rol_req` (`id_tratamiento`, `id_rol_recurso`),
  CONSTRAINT `fk_cli_trat_rol_req_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_trat_rol_req_rol` FOREIGN KEY (`id_rol_recurso`) REFERENCES `cli_rol_recurso` (`id_rol_recurso`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Roles humanos adicionales que exige un tratamiento';

CREATE TABLE IF NOT EXISTS `cli_cita_recurso_humano` (
  `id_cita_recurso_humano` INT NOT NULL AUTO_INCREMENT,
  `id_cita` INT NOT NULL,
  `id_personal` INT NOT NULL,
  `id_rol_recurso` INT NULL COMMENT 'NULL = profesional principal',
  `es_principal` TINYINT(1) NOT NULL DEFAULT 0,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cita_recurso_humano`),
  KEY `idx_cli_cita_rh_cita` (`id_cita`),
  KEY `idx_cli_cita_rh_pers` (`id_personal`),
  CONSTRAINT `fk_cli_cita_rh_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_rh_pers` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_rh_rol` FOREIGN KEY (`id_rol_recurso`) REFERENCES `cli_rol_recurso` (`id_rol_recurso`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Participantes humanos de una cita (multi-recurso)';

CREATE TABLE IF NOT EXISTS `cli_contraindicacion_cruzada` (
  `id_contraindicacion_cruzada` INT NOT NULL AUTO_INCREMENT,
  `id_tratamiento` INT NOT NULL,
  `id_tratamiento_conflicto` INT NOT NULL,
  `dias_minimos` INT NOT NULL DEFAULT 15,
  `descripcion` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_contraindicacion_cruzada`),
  UNIQUE KEY `uk_cli_contra_cruz` (`id_tratamiento`, `id_tratamiento_conflicto`),
  CONSTRAINT `fk_cli_contra_cruz_a` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_contra_cruz_b` FOREIGN KEY (`id_tratamiento_conflicto`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Separación mínima entre tratamientos distintos';

-- Columnas nuevas en tablas existentes
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND COLUMN_NAME = 'penalidad_aplicada');
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_cita ADD COLUMN penalidad_aplicada TINYINT(1) NOT NULL DEFAULT 0 AFTER motivo_cancelacion',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND COLUMN_NAME = 'hora_fin_recurso');
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_cita ADD COLUMN hora_fin_recurso TIME NULL AFTER hora_fin',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_tratamiento' AND COLUMN_NAME = 'intervalo_minimo_dias');
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_tratamiento ADD COLUMN intervalo_minimo_dias INT NULL DEFAULT 0 AFTER intervalo_minutos',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_tratamiento' AND COLUMN_NAME = 'color_agenda');
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_tratamiento ADD COLUMN color_agenda VARCHAR(20) NULL AFTER intervalo_minimo_dias',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed roles base
INSERT INTO `cli_rol_recurso` (`codigo`, `nombre`, `descripcion`)
SELECT v.codigo, v.nombre, v.descripcion FROM (
  SELECT 'PRINCIPAL' AS codigo, 'Profesional principal' AS nombre, 'Atiende el tratamiento' AS descripcion UNION ALL
  SELECT 'MEDICO', 'Médico / especialista', 'Personal médico' UNION ALL
  SELECT 'COSMIATRA', 'Cosmiatra', 'Personal cosmiátrico' UNION ALL
  SELECT 'ENFERMERA', 'Enfermera', 'Apoyo de enfermería' UNION ALL
  SELECT 'ANESTESISTA', 'Anestesista', 'Puede actuar como anestesista en procedimientos'
) v
WHERE NOT EXISTS (SELECT 1 FROM cli_rol_recurso r WHERE r.codigo = v.codigo AND r.estado_registro = 'ACTIVO');
