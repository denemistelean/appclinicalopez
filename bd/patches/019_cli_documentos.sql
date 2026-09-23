-- ==============================================================================
-- PATCH 019 — Módulo Documentos (tipos + archivos + serie diaria + permisos)
-- Estructura disco:
--   {DOCUMENTOS_ROOT}/PACIENTES/{id:9}/GENERAL/{CATEGORIA}/{yyyy-mm-dd-#####}.ext
--   {DOCUMENTOS_ROOT}/PACIENTES/{id:9}/ATENCIONES/{año}/{id_consulta:8}/{CATEGORIA}/...
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_tipo_documento` (
  `id_tipo_documento` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(60) NOT NULL COMMENT 'Nombre de carpeta: DOCUMENTOS, FOTOS, etc.',
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `extensiones` VARCHAR(120) NULL COMMENT 'pdf,jpg,png (sin punto)',
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tipo_documento`),
  UNIQUE KEY `uk_cli_tipo_doc_codigo` (`codigo`)
) ENGINE=InnoDB COMMENT='Catálogo de categorías/tipos de documento (define carpeta)';

CREATE TABLE IF NOT EXISTS `cli_documento_serie` (
  `fecha` DATE NOT NULL,
  `ultimo_correlativo` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`fecha`)
) ENGINE=InnoDB COMMENT='Correlativo diario para nombre de archivo';

CREATE TABLE IF NOT EXISTS `cli_documento` (
  `id_documento` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_tipo_documento` INT NOT NULL,
  `id_consulta` INT NULL COMMENT 'Atención clínica (opcional)',
  `id_cita` INT NULL COMMENT 'Referencia agenda (opcional)',
  `titulo` VARCHAR(200) NULL,
  `nombre_original` VARCHAR(255) NOT NULL,
  `nombre_archivo` VARCHAR(80) NOT NULL COMMENT 'yyyy-mm-dd-#####.ext',
  `ruta_relativa` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(120) NULL,
  `tamano_bytes` INT NULL,
  `fecha_documento` DATE NULL,
  `observaciones` VARCHAR(500) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_documento`),
  KEY `idx_cli_documento_paciente` (`id_paciente`),
  KEY `idx_cli_documento_tipo` (`id_tipo_documento`),
  KEY `idx_cli_documento_consulta` (`id_consulta`),
  KEY `idx_cli_documento_cita` (`id_cita`),
  KEY `idx_cli_documento_fecha` (`fecha_documento`),
  CONSTRAINT `fk_cli_documento_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_documento_tipo` FOREIGN KEY (`id_tipo_documento`) REFERENCES `cli_tipo_documento` (`id_tipo_documento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_documento_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_documento_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Documentos escaneados / archivos del paciente';

INSERT INTO `cli_tipo_documento` (`codigo`, `nombre`, `descripcion`, `extensiones`, `activo`)
SELECT v.codigo, v.nombre, v.descripcion, v.extensiones, 1
FROM (
  SELECT 'DOCUMENTOS' AS codigo, 'Documentos' AS nombre, 'PDF e informes generales' AS descripcion, 'pdf' AS extensiones UNION ALL
  SELECT 'FOTOS', 'Fotos', 'Imágenes clínicas / evolución', 'jpg,jpeg,png,webp' UNION ALL
  SELECT 'CONSENTIMIENTOS', 'Consentimientos', 'Consentimientos firmados escaneados', 'pdf,jpg,jpeg,png' UNION ALL
  SELECT 'OTROS', 'Otros', 'Otros archivos', 'pdf,jpg,jpeg,png,doc,docx'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM cli_tipo_documento t WHERE t.codigo = v.codigo AND t.estado_registro = 'ACTIVO'
);

-- Permisos
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'DOCUMENTOS', 'Documentos', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'DOCUMENTOS');

SET @id_mod_doc := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'DOCUMENTOS' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_doc, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_documento' AS codigo, 'Ver documentos' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_documento', 'Subir documentos', 'CREATE' UNION ALL
  SELECT 'actualizar_documento', 'Actualizar documentos', 'UPDATE' UNION ALL
  SELECT 'eliminar_documento', 'Eliminar documentos', 'DELETE' UNION ALL
  SELECT 'gestionar_tipo_documento', 'Gestionar tipos de documento', 'UPDATE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_doc AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_doc AND a.estado_registro = 'ACTIVO';
