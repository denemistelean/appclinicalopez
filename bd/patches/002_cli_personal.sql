-- ==============================================================================
-- PATCH 002 — Personal / especialistas, horarios, comisiones + permisos PERSONAL
-- Nota: cli_personal_tratamiento.id_tratamiento sin FK hasta patch 003
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_personal` (
  `id_personal` INT NOT NULL AUTO_INCREMENT,
  `documento` VARCHAR(30) NOT NULL,
  `tipo_documento` VARCHAR(20) NOT NULL DEFAULT 'DNI',
  `nombres` VARCHAR(100) NOT NULL,
  `apellidos` VARCHAR(100) NOT NULL,
  `especialidad` VARCHAR(120) NULL,
  `telefono` VARCHAR(40) NULL,
  `email` VARCHAR(150) NULL,
  `id_sede_principal` INT NULL,
  `id_usuario` INT NULL COMMENT 'Vínculo opcional a sis_usuario',
  `estado` ENUM('ACTIVO','INACTIVO','VACACIONES','LICENCIA') NOT NULL DEFAULT 'ACTIVO',
  `observaciones` VARCHAR(500) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal`),
  UNIQUE KEY `uk_cli_personal_documento` (`documento`),
  KEY `idx_cli_personal_sede_prin` (`id_sede_principal`),
  KEY `idx_cli_personal_usuario` (`id_usuario`),
  CONSTRAINT `fk_cli_personal_sede_prin` FOREIGN KEY (`id_sede_principal`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_personal_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Personal clínico / especialistas';

CREATE TABLE IF NOT EXISTS `cli_personal_sede` (
  `id_personal_sede` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `es_principal` TINYINT(1) NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_sede`),
  UNIQUE KEY `uk_cli_personal_sede` (`id_personal`, `id_sede`),
  KEY `idx_cli_personal_sede_sede` (`id_sede`),
  CONSTRAINT `fk_cli_personal_sede_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_personal_sede_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Asignación multi-sede del personal';

CREATE TABLE IF NOT EXISTS `cli_horario_trabajo` (
  `id_horario_trabajo` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `dia_semana` TINYINT NOT NULL COMMENT '0=Domingo … 6=Sábado',
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_horario_trabajo`),
  KEY `idx_cli_horario_personal` (`id_personal`),
  KEY `idx_cli_horario_sede` (`id_sede`),
  CONSTRAINT `fk_cli_horario_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_horario_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Horario semanal recurrente por personal/sede';

CREATE TABLE IF NOT EXISTS `cli_excepcion_horario` (
  `id_excepcion_horario` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_sede` INT NULL,
  `fecha` DATE NOT NULL,
  `tipo` ENUM('DIA_LIBRE','HORARIO_ESPECIAL','BLOQUEO') NOT NULL DEFAULT 'DIA_LIBRE',
  `hora_inicio` TIME NULL,
  `hora_fin` TIME NULL,
  `motivo` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_excepcion_horario`),
  KEY `idx_cli_excep_personal_fecha` (`id_personal`, `fecha`),
  KEY `idx_cli_excep_sede` (`id_sede`),
  CONSTRAINT `fk_cli_excep_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_excep_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Excepciones puntuales al horario de trabajo';

-- Esqueleto: FK a cli_tratamiento se agrega en patch 003
CREATE TABLE IF NOT EXISTS `cli_personal_tratamiento` (
  `id_personal_tratamiento` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_tratamiento` INT NOT NULL COMMENT 'FK diferida a cli_tratamiento (patch 003)',
  `fecha_certificacion` DATE NULL,
  `fecha_vencimiento` DATE NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_tratamiento`),
  UNIQUE KEY `uk_cli_personal_tratamiento` (`id_personal`, `id_tratamiento`),
  KEY `idx_cli_pers_trat_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_pers_trat_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Certificaciones personal ↔ tratamiento';

CREATE TABLE IF NOT EXISTS `cli_regla_comision` (
  `id_regla_comision` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_tratamiento` INT NULL COMMENT 'NULL = regla general; FK diferida opcional',
  `tipo_comision` ENUM('PORCENTAJE','MONTO_FIJO') NOT NULL DEFAULT 'PORCENTAJE',
  `valor` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `vigente_desde` DATE NULL,
  `vigente_hasta` DATE NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_regla_comision`),
  KEY `idx_cli_regla_comision_pers` (`id_personal`),
  CONSTRAINT `fk_cli_regla_comision_pers` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Reglas opcionales de comisión por personal/tratamiento';

-- ---------- Permisos PERSONAL ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'PERSONAL', 'Personal', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'PERSONAL');

SET @id_mod_personal := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'PERSONAL' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_personal, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_personal' AS codigo, 'Ver personal' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_personal', 'Crear personal', 'CREATE' UNION ALL
  SELECT 'actualizar_personal', 'Actualizar personal', 'UPDATE' UNION ALL
  SELECT 'eliminar_personal', 'Eliminar personal', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_personal AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_personal AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_personal AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
