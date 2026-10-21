-- PATCH 029 — Procedimientos (extiende tratamientos) + tipos de cita CONSULTA/SEGUIMIENTO/PROCEDIMIENTO
USE app_clinica_lopez;

-- Tipo de procedimiento en catálogo (quirúrgico / no quirúrgico)
ALTER TABLE `cli_tratamiento`
  ADD COLUMN IF NOT EXISTS `tipo_procedimiento` ENUM('QUIRURGICO','NO_QUIRURGICO') NULL
    COMMENT 'Clasificación para agenda' AFTER `categoria`;

-- Detalle multi-procedimiento por cita
CREATE TABLE IF NOT EXISTS `cli_cita_tratamiento` (
  `id_cita_tratamiento` INT NOT NULL AUTO_INCREMENT,
  `id_cita` INT NOT NULL,
  `id_tratamiento` INT NOT NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cita_tratamiento`),
  UNIQUE KEY `uk_cli_cita_trat` (`id_cita`, `id_tratamiento`),
  KEY `idx_cli_cita_trat_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_cita_trat_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE CASCADE,
  CONSTRAINT `fk_cli_cita_trat_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tipos de cita: solo CONSULTA, SEGUIMIENTO, PROCEDIMIENTO
UPDATE `cli_tipo_cita`
SET `estado_registro` = 'ELIMINADO'
WHERE `codigo` IN ('CITA_SIMPLE', 'CIRUGIA_FACIAL', 'CIRUGIA_CORPORAL', 'SESION_EQUIPO')
  AND `estado_registro` = 'ACTIVO';

INSERT INTO `cli_tipo_cita`
  (`codigo`, `nombre`, `descripcion`, `duracion_default_minutos`, `requiere_tratamiento`, `requiere_sala`, `requiere_equipo`, `requiere_certificacion`, `color_agenda`, `estado_registro`)
SELECT 'CONSULTA', 'Consulta', 'Consulta / evaluación inicial', 30, 0, 0, 0, 0, '#4C6B8A', 'ACTIVO'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `cli_tipo_cita` WHERE `codigo` = 'CONSULTA');

INSERT INTO `cli_tipo_cita`
  (`codigo`, `nombre`, `descripcion`, `duracion_default_minutos`, `requiere_tratamiento`, `requiere_sala`, `requiere_equipo`, `requiere_certificacion`, `color_agenda`, `estado_registro`)
SELECT 'SEGUIMIENTO', 'Seguimiento', 'Control o seguimiento', 20, 0, 0, 0, 0, '#5B6960', 'ACTIVO'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `cli_tipo_cita` WHERE `codigo` = 'SEGUIMIENTO');

UPDATE `cli_tipo_cita`
SET `nombre` = 'Procedimiento',
    `descripcion` = 'Uno o más procedimientos del mismo tipo',
    `duracion_default_minutos` = 45,
    `requiere_tratamiento` = 1,
    `requiere_sala` = 0,
    `requiere_equipo` = 0,
    `requiere_certificacion` = 0,
    `color_agenda` = '#1F4E4A',
    `estado_registro` = 'ACTIVO'
WHERE `codigo` = 'PROCEDIMIENTO';

INSERT INTO `cli_tipo_cita`
  (`codigo`, `nombre`, `descripcion`, `duracion_default_minutos`, `requiere_tratamiento`, `requiere_sala`, `requiere_equipo`, `requiere_certificacion`, `color_agenda`, `estado_registro`)
SELECT 'PROCEDIMIENTO', 'Procedimiento', 'Uno o más procedimientos del mismo tipo', 45, 1, 0, 0, 0, '#1F4E4A', 'ACTIVO'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `cli_tipo_cita` WHERE `codigo` = 'PROCEDIMIENTO');

-- Actualizar existentes
UPDATE `cli_tratamiento`
SET `tipo_procedimiento` = 'NO_QUIRURGICO', `codigo` = COALESCE(`codigo`, 'TOXINA'), `categoria` = 'NO_QUIRURGICO'
WHERE UPPER(TRIM(`nombre`)) LIKE '%TOXINA%' AND `estado_registro` = 'ACTIVO';

UPDATE `cli_tratamiento`
SET `tipo_procedimiento` = 'QUIRURGICO', `codigo` = COALESCE(`codigo`, 'RINOPLASTIA'), `categoria` = 'QUIRURGICO', `duracion_minutos` = 120
WHERE UPPER(TRIM(`nombre`)) LIKE '%RINOPLASTIA%' AND UPPER(TRIM(`nombre`)) NOT LIKE '%RINOSEPTO%' AND `estado_registro` = 'ACTIVO';

-- Seed procedimientos quirúrgicos
INSERT INTO `cli_tratamiento` (`codigo`, `nombre`, `categoria`, `tipo_procedimiento`, `duracion_minutos`, `precio_base`, `requiere_sala`, `requiere_equipo`, `estado`)
SELECT v.codigo, v.nombre, 'QUIRURGICO', 'QUIRURGICO', v.dur, 0, 0, 0, 'ACTIVO'
FROM (
  SELECT 'RINOSEPTO' AS codigo, 'RINOSEPTOPLASTIA' AS nombre, 150 AS dur UNION ALL
  SELECT 'BLEF_INF', 'BLEFAROPLASTIA INFERIOR', 90 UNION ALL
  SELECT 'BLEF_SUP', 'BLEFAROPLASTIA SUPERIOR', 90 UNION ALL
  SELECT 'LIFT_CEJAS', 'LIFTING ENDOSCÓPICO DE CEJAS', 120 UNION ALL
  SELECT 'LIFT_FACIAL', 'LIFTING FACIAL (DEEP PLANE)', 240 UNION ALL
  SELECT 'MENTOPLASTIA', 'MENTOPLASTIA', 90 UNION ALL
  SELECT 'LIFT_LABIOS', 'LIFTING DE LABIOS', 60 UNION ALL
  SELECT 'OTOPLASTIA', 'OTOPLASTIA', 90 UNION ALL
  SELECT 'LIPOABDOM', 'LIPOABDOMINOPLASTIA', 180 UNION ALL
  SELECT 'LIPOTRANSF', 'LIPOTRANSFERENCIA', 120 UNION ALL
  SELECT 'AUM_GLUTEOS', 'AUMENTO DE GLÚTEOS', 120 UNION ALL
  SELECT 'LIPOFILLING', 'LIPOFILLING', 90 UNION ALL
  SELECT 'EXERESIS', 'EXÉRESIS', 45 UNION ALL
  SELECT 'OTROS_QX', 'OTROS PROCEDIMIENTOS QUIRÚRGICOS', 60
) v
WHERE NOT EXISTS (
  SELECT 1 FROM `cli_tratamiento` t
  WHERE t.estado_registro = 'ACTIVO' AND (t.codigo = v.codigo OR UPPER(TRIM(t.nombre)) = v.nombre)
);

-- Seed no quirúrgicos
INSERT INTO `cli_tratamiento` (`codigo`, `nombre`, `categoria`, `tipo_procedimiento`, `duracion_minutos`, `precio_base`, `requiere_sala`, `requiere_equipo`, `estado`)
SELECT v.codigo, v.nombre, 'NO_QUIRURGICO', 'NO_QUIRURGICO', v.dur, 0, 0, 0, 'ACTIVO'
FROM (
  SELECT 'ACIDO_HIAL' AS codigo, 'ÁCIDO HIALURÓNICO' AS nombre, 45 AS dur UNION ALL
  SELECT 'ENZIMAS', 'TRATAMIENTOS CON ENZIMAS', 45 UNION ALL
  SELECT 'EXO_FACIAL', 'EXOSOMAS FACIALES', 60 UNION ALL
  SELECT 'EXO_CORP', 'EXOSOMAS CORPORALES', 60 UNION ALL
  SELECT 'EXO_CAPILAR', 'TRATAMIENTOS CAPILARES CON EXOSOMAS', 60 UNION ALL
  SELECT 'BIOESTIM', 'BIOESTIMULADOR FACIAL', 45 UNION ALL
  SELECT 'OTROS_NQX', 'OTROS TRATAMIENTOS NO QUIRÚRGICOS', 30
) v
WHERE NOT EXISTS (
  SELECT 1 FROM `cli_tratamiento` t
  WHERE t.estado_registro = 'ACTIVO' AND (t.codigo = v.codigo OR UPPER(TRIM(t.nombre)) = v.nombre)
);

-- Asegurar toxina
INSERT INTO `cli_tratamiento` (`codigo`, `nombre`, `categoria`, `tipo_procedimiento`, `duracion_minutos`, `precio_base`, `requiere_sala`, `requiere_equipo`, `estado`)
SELECT 'TOXINA', 'TOXINA BOTULÍNICA', 'NO_QUIRURGICO', 'NO_QUIRURGICO', 30, 0, 0, 0, 'ACTIVO'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cli_tratamiento` t
  WHERE t.estado_registro = 'ACTIVO' AND (t.codigo = 'TOXINA' OR UPPER(TRIM(t.nombre)) LIKE '%TOXINA%')
);

-- Asegurar rinoplastia
INSERT INTO `cli_tratamiento` (`codigo`, `nombre`, `categoria`, `tipo_procedimiento`, `duracion_minutos`, `precio_base`, `requiere_sala`, `requiere_equipo`, `estado`)
SELECT 'RINOPLASTIA', 'RINOPLASTIA', 'QUIRURGICO', 'QUIRURGICO', 120, 0, 0, 0, 'ACTIVO'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cli_tratamiento` t
  WHERE t.estado_registro = 'ACTIVO' AND (t.codigo = 'RINOPLASTIA' OR UPPER(TRIM(t.nombre)) = 'RINOPLASTIA')
);
