-- ==============================================================================
-- PATCH 022 — Mapa corporal 3D (marcadores de intervención / seguimiento)
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_mapa_marcador` (
  `id_mapa_marcador` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_consulta` INT NULL,
  `id_cita` INT NULL,
  `zona_codigo` VARCHAR(80) NOT NULL COMMENT 'Catálogo anatómico o personalizado-{uuid}',
  `zona_label` VARCHAR(150) NOT NULL,
  `lado` VARCHAR(30) NOT NULL DEFAULT 'Frontal' COMMENT 'Frontal | Posterior | Personalizado',
  `procedimiento` VARCHAR(150) NOT NULL,
  `estado` ENUM('PLANIFICADO','REALIZADO','SEGUIMIENTO') NOT NULL DEFAULT 'PLANIFICADO',
  `fecha_plan` DATE NULL,
  `notas` VARCHAR(1000) NULL,
  `pos_x` DECIMAL(14,6) NOT NULL,
  `pos_y` DECIMAL(14,6) NOT NULL,
  `pos_z` DECIMAL(14,6) NOT NULL,
  `origen` ENUM('CATALOGO','MANUAL') NOT NULL DEFAULT 'CATALOGO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_mapa_marcador`),
  KEY `idx_cli_mapa_paciente` (`id_paciente`),
  KEY `idx_cli_mapa_consulta` (`id_consulta`),
  KEY `idx_cli_mapa_cita` (`id_cita`),
  CONSTRAINT `fk_cli_mapa_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_mapa_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_mapa_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Puntos 3D de intervención quirúrgica / seguimiento';

INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'MAPA_CORPORAL', 'Mapa corporal 3D', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'MAPA_CORPORAL');

SET @id_mod_map := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'MAPA_CORPORAL' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_map, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_mapa_corporal' AS codigo, 'Ver mapa corporal 3D' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_mapa_marcador', 'Crear marcadores 3D', 'CREATE' UNION ALL
  SELECT 'actualizar_mapa_marcador', 'Actualizar marcadores 3D', 'UPDATE' UNION ALL
  SELECT 'eliminar_mapa_marcador', 'Eliminar marcadores 3D', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_map AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_map AND a.estado_registro = 'ACTIVO';
