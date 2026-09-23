-- ==============================================================================
-- PATCH 005 — Pacientes + documentos + permisos PACIENTES
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_paciente` (
  `id_paciente` INT NOT NULL AUTO_INCREMENT,
  `tipo_documento` VARCHAR(20) NOT NULL DEFAULT 'DNI',
  `numero_documento` VARCHAR(30) NOT NULL,
  `nombres` VARCHAR(100) NOT NULL,
  `apellidos` VARCHAR(100) NOT NULL,
  `fecha_nacimiento` DATE NULL,
  `sexo` ENUM('M','F','X','NO_ESPECIFICADO') NULL,
  `estado_civil` VARCHAR(40) NULL,
  `telefono` VARCHAR(40) NULL,
  `telefono_alterno` VARCHAR(40) NULL,
  `email` VARCHAR(150) NULL,
  `direccion` VARCHAR(255) NULL,
  `distrito` VARCHAR(100) NULL,
  `ciudad` VARCHAR(100) NULL,
  `ocupacion` VARCHAR(120) NULL,
  `contacto_emergencia_nombre` VARCHAR(150) NULL,
  `contacto_emergencia_telefono` VARCHAR(40) NULL,
  `id_sede_registro` INT NULL,
  `observaciones` TEXT NULL,
  `estado` ENUM('ACTIVO','INACTIVO','FUSIONADO') NOT NULL DEFAULT 'ACTIVO',
  `id_paciente_fusionado` INT NULL COMMENT 'Si fue mergeado, apunta al sobreviviente',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente`),
  UNIQUE KEY `uk_cli_paciente_documento` (`numero_documento`),
  KEY `idx_cli_paciente_nombres` (`apellidos`, `nombres`),
  KEY `idx_cli_paciente_sede` (`id_sede_registro`),
  KEY `idx_cli_paciente_fusion` (`id_paciente_fusionado`),
  CONSTRAINT `fk_cli_paciente_sede` FOREIGN KEY (`id_sede_registro`) REFERENCES `cli_sede` (`id_sede`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_paciente_fusion` FOREIGN KEY (`id_paciente_fusionado`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Ficha demográfica de pacientes';

CREATE TABLE IF NOT EXISTS `cli_documento_paciente` (
  `id_documento_paciente` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `tipo_documento` VARCHAR(60) NOT NULL COMMENT 'DNI_SCAN, CONSENTIMIENTO, OTRO',
  `nombre_archivo` VARCHAR(255) NOT NULL,
  `ruta_archivo` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NULL,
  `tamano_bytes` INT NULL,
  `fecha_documento` DATE NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_documento_paciente`),
  KEY `idx_cli_doc_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_doc_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Documentos adjuntos del paciente';

-- ---------- Permisos PACIENTES ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'PACIENTES', 'Pacientes', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'PACIENTES');

SET @id_mod_pac := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'PACIENTES' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_pac, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_paciente' AS codigo, 'Ver pacientes' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_paciente', 'Crear pacientes', 'CREATE' UNION ALL
  SELECT 'actualizar_paciente', 'Actualizar pacientes', 'UPDATE' UNION ALL
  SELECT 'eliminar_paciente', 'Eliminar pacientes', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_pac AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_pac AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_pac AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
