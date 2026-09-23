-- ==============================================================================
-- PATCH 008 — Historia clínica: plantillas, CIE-10, consultas + permisos
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_plantilla_clinica` (
  `id_plantilla_clinica` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `especialidad` VARCHAR(120) NULL,
  `id_tratamiento` INT NULL,
  `estructura_json` JSON NULL COMMENT 'Campos dinámicos de la plantilla',
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_plantilla_clinica`),
  KEY `idx_cli_plantilla_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_plantilla_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Plantillas de nota clínica';

CREATE TABLE IF NOT EXISTS `cli_plantilla_plan` (
  `id_plantilla_plan` INT NOT NULL AUTO_INCREMENT,
  `id_plantilla_clinica` INT NOT NULL,
  `tipo_item` ENUM('TRATAMIENTO','EXAMEN','IMAGEN','INDICACION','OTRO') NOT NULL DEFAULT 'TRATAMIENTO',
  `descripcion` VARCHAR(255) NOT NULL,
  `id_tratamiento` INT NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_plantilla_plan`),
  KEY `idx_cli_plant_plan_plant` (`id_plantilla_clinica`),
  KEY `idx_cli_plant_plan_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_plant_plan_plant` FOREIGN KEY (`id_plantilla_clinica`) REFERENCES `cli_plantilla_clinica` (`id_plantilla_clinica`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_plant_plan_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Ítems de plan sugeridos por plantilla';

CREATE TABLE IF NOT EXISTS `cli_cie10` (
  `id_cie10` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `descripcion` VARCHAR(255) NOT NULL,
  `categoria` VARCHAR(120) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cie10`),
  UNIQUE KEY `uk_cli_cie10_codigo` (`codigo`)
) ENGINE=InnoDB COMMENT='Catálogo CIE-10 (muestra)';

INSERT INTO `cli_cie10` (`codigo`, `descripcion`, `categoria`, `estado_registro`)
SELECT v.codigo, v.descripcion, v.categoria, 'ACTIVO'
FROM (
  SELECT 'L70.0' AS codigo, 'Acné vulgar' AS descripcion, 'Dermatología' AS categoria UNION ALL
  SELECT 'L81.4', 'Otras melaninas', 'Dermatología' UNION ALL
  SELECT 'L57.0', 'Queratosis actínica', 'Dermatología' UNION ALL
  SELECT 'E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'Endocrinología' UNION ALL
  SELECT 'I10', 'Hipertensión esencial (primaria)', 'Cardiología' UNION ALL
  SELECT 'J30.4', 'Rinitis alérgica, no especificada', 'Alergología' UNION ALL
  SELECT 'M54.5', 'Lumbago no especificado', 'Traumatología' UNION ALL
  SELECT 'Z00.0', 'Examen médico general', 'Preventiva'
) v
WHERE NOT EXISTS (SELECT 1 FROM cli_cie10 c WHERE c.codigo = v.codigo);

CREATE TABLE IF NOT EXISTS `cli_consulta` (
  `id_consulta` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `id_personal` INT NOT NULL,
  `id_cita` INT NULL,
  `id_plantilla_clinica` INT NULL,
  `fecha_consulta` DATETIME NOT NULL,
  `motivo_consulta` VARCHAR(500) NOT NULL,
  `anamnesis` TEXT NULL,
  `examen_fisico` TEXT NULL,
  `datos_plantilla_json` JSON NULL,
  `estado` ENUM('BORRADOR','FINALIZADA','ANULADA') NOT NULL DEFAULT 'BORRADOR',
  `fecha_finalizacion` DATETIME NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta`),
  KEY `idx_cli_consulta_paciente` (`id_paciente`),
  KEY `idx_cli_consulta_sede` (`id_sede`),
  KEY `idx_cli_consulta_personal` (`id_personal`),
  KEY `idx_cli_consulta_cita` (`id_cita`),
  KEY `idx_cli_consulta_plantilla` (`id_plantilla_clinica`),
  CONSTRAINT `fk_cli_consulta_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_consulta_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_consulta_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_consulta_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_consulta_plantilla` FOREIGN KEY (`id_plantilla_clinica`) REFERENCES `cli_plantilla_clinica` (`id_plantilla_clinica`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Consultas / notas clínicas (finalizada = inmutable)';

CREATE TABLE IF NOT EXISTS `cli_consulta_diagnostico` (
  `id_consulta_diagnostico` INT NOT NULL AUTO_INCREMENT,
  `id_consulta` INT NOT NULL,
  `id_cie10` INT NULL,
  `codigo_cie10` VARCHAR(20) NULL,
  `descripcion` VARCHAR(255) NOT NULL,
  `tipo` ENUM('PRINCIPAL','SECUNDARIO','PRESUNTIVO') NOT NULL DEFAULT 'PRINCIPAL',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_diagnostico`),
  KEY `idx_cli_diag_consulta` (`id_consulta`),
  KEY `idx_cli_diag_cie10` (`id_cie10`),
  CONSTRAINT `fk_cli_diag_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_diag_cie10` FOREIGN KEY (`id_cie10`) REFERENCES `cli_cie10` (`id_cie10`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Diagnósticos de la consulta';

CREATE TABLE IF NOT EXISTS `cli_consulta_plan` (
  `id_consulta_plan` INT NOT NULL AUTO_INCREMENT,
  `id_consulta` INT NOT NULL,
  `indicaciones_generales` TEXT NULL,
  `observaciones` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_plan`),
  UNIQUE KEY `uk_cli_consulta_plan` (`id_consulta`),
  CONSTRAINT `fk_cli_consulta_plan_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Plan terapéutico cabecera (1:1 con consulta)';

CREATE TABLE IF NOT EXISTS `cli_consulta_plan_tratamiento` (
  `id_consulta_plan_tratamiento` INT NOT NULL AUTO_INCREMENT,
  `id_consulta_plan` INT NOT NULL,
  `id_tratamiento` INT NULL,
  `descripcion` VARCHAR(255) NOT NULL,
  `cantidad_sesiones` INT NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_plan_tratamiento`),
  KEY `idx_cli_plan_trat_plan` (`id_consulta_plan`),
  KEY `idx_cli_plan_trat_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_plan_trat_plan` FOREIGN KEY (`id_consulta_plan`) REFERENCES `cli_consulta_plan` (`id_consulta_plan`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_plan_trat_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Tratamientos indicados en el plan';

CREATE TABLE IF NOT EXISTS `cli_consulta_plan_examen` (
  `id_consulta_plan_examen` INT NOT NULL AUTO_INCREMENT,
  `id_consulta_plan` INT NOT NULL,
  `nombre_examen` VARCHAR(150) NOT NULL,
  `indicaciones` VARCHAR(255) NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_plan_examen`),
  KEY `idx_cli_plan_examen_plan` (`id_consulta_plan`),
  CONSTRAINT `fk_cli_plan_examen_plan` FOREIGN KEY (`id_consulta_plan`) REFERENCES `cli_consulta_plan` (`id_consulta_plan`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Exámenes de laboratorio indicados';

CREATE TABLE IF NOT EXISTS `cli_consulta_plan_imagen` (
  `id_consulta_plan_imagen` INT NOT NULL AUTO_INCREMENT,
  `id_consulta_plan` INT NOT NULL,
  `nombre_estudio` VARCHAR(150) NOT NULL,
  `indicaciones` VARCHAR(255) NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_plan_imagen`),
  KEY `idx_cli_plan_imagen_plan` (`id_consulta_plan`),
  CONSTRAINT `fk_cli_plan_imagen_plan` FOREIGN KEY (`id_consulta_plan`) REFERENCES `cli_consulta_plan` (`id_consulta_plan`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Estudios de imagen indicados';

-- ---------- Permisos HISTORIA_CLINICA ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'HISTORIA_CLINICA', 'Historia clínica', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'HISTORIA_CLINICA');

SET @id_mod_hc := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'HISTORIA_CLINICA' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_hc, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_historia_clinica' AS codigo, 'Ver historia clínica' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_historia_clinica', 'Crear consultas clínicas', 'CREATE' UNION ALL
  SELECT 'actualizar_historia_clinica', 'Actualizar borradores clínicos', 'UPDATE' UNION ALL
  SELECT 'eliminar_historia_clinica', 'Anular/eliminar consultas', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_hc AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_hc AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_hc AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
