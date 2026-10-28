-- PATCH 042 — Sorela: plantillas recordatorio, moneda/TC, promos catálogo, intervalo equipos
-- Idempotente donde aplica (MariaDB).

-- ---------- Plantillas de mensaje (dashboard / recordatorios) ----------
CREATE TABLE IF NOT EXISTS `cli_plantilla_mensaje` (
  `id_plantilla` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `codigo` VARCHAR(40) NOT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `canal` ENUM('WHATSAPP','SMS','COPIAR') NOT NULL DEFAULT 'WHATSAPP',
  `cuerpo` TEXT NOT NULL COMMENT 'Placeholders: {{paciente}} {{fecha}} {{hora}} {{sede}} {{tratamiento}} {{personal}}',
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_plantilla`),
  UNIQUE KEY `uk_plantilla_unidad_codigo` (`id_unidad`, `codigo`),
  KEY `idx_plantilla_unidad` (`id_unidad`),
  CONSTRAINT `fk_plantilla_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Plantillas de recordatorio (Sorela / multi-unidad)';

INSERT INTO `cli_plantilla_mensaje` (`id_unidad`, `codigo`, `nombre`, `canal`, `cuerpo`, `activo`)
SELECT u.id_unidad, 'CITA_MANANA', 'Recordatorio cita (mañana)', 'WHATSAPP',
       'Hola {{paciente}}, le recordamos su cita en Sorela Medic el {{fecha}} a las {{hora}} ({{tratamiento}}). ¡Le esperamos!', 1
FROM `cli_unidad` u
WHERE u.codigo = 'SORELA' AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_plantilla_mensaje` p
    WHERE p.id_unidad = u.id_unidad AND p.codigo = 'CITA_MANANA' AND p.estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_plantilla_mensaje` (`id_unidad`, `codigo`, `nombre`, `canal`, `cuerpo`, `activo`)
SELECT u.id_unidad, 'CITA_HOY', 'Recordatorio cita (hoy)', 'WHATSAPP',
       'Hola {{paciente}}, hoy {{fecha}} a las {{hora}} tiene su cita en Sorela Medic ({{tratamiento}} con {{personal}}). Confirme su asistencia, por favor.', 1
FROM `cli_unidad` u
WHERE u.codigo = 'SORELA' AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_plantilla_mensaje` p
    WHERE p.id_unidad = u.id_unidad AND p.codigo = 'CITA_HOY' AND p.estado_registro = 'ACTIVO'
  );

-- ---------- Moneda y tipo de cambio ----------
CREATE TABLE IF NOT EXISTS `cli_tipo_cambio` (
  `id_tipo_cambio` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `moneda` ENUM('PEN','USD') NOT NULL DEFAULT 'USD',
  `valor` DECIMAL(12,4) NOT NULL COMMENT 'Cuántos soles por 1 unidad de moneda (p. ej. USD)',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_tipo_cambio`),
  UNIQUE KEY `uk_tc_unidad_fecha_moneda` (`id_unidad`, `fecha`, `moneda`),
  CONSTRAINT `fk_tc_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Tipo de cambio diario por unidad';

SET @col_moneda := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'moneda'
);
SET @sql_moneda := IF(@col_moneda = 0,
  'ALTER TABLE cli_pago ADD COLUMN moneda ENUM(''PEN'',''USD'') NOT NULL DEFAULT ''PEN'' AFTER monto',
  'SELECT 1');
PREPARE stmt FROM @sql_moneda; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_tc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'tipo_cambio'
);
SET @sql_tc := IF(@col_tc = 0,
  'ALTER TABLE cli_pago ADD COLUMN tipo_cambio DECIMAL(12,4) NULL AFTER moneda',
  'SELECT 1');
PREPARE stmt FROM @sql_tc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_monto_orig := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'monto_moneda'
);
SET @sql_mo := IF(@col_monto_orig = 0,
  'ALTER TABLE cli_pago ADD COLUMN monto_moneda DECIMAL(12,2) NULL COMMENT ''Monto en la moneda elegida; monto queda en PEN'' AFTER tipo_cambio',
  'SELECT 1');
PREPARE stmt FROM @sql_mo; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- Promociones / descuentos en catálogo ----------
SET @col_desc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_catalogo_item' AND COLUMN_NAME = 'descuento_pct'
);
SET @sql_desc := IF(@col_desc = 0,
  'ALTER TABLE cli_catalogo_item
     ADD COLUMN descuento_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER nota,
     ADD COLUMN promo_nombre VARCHAR(120) NULL AFTER descuento_pct,
     ADD COLUMN promo_desde DATE NULL AFTER promo_nombre,
     ADD COLUMN promo_hasta DATE NULL AFTER promo_desde',
  'SELECT 1');
PREPARE stmt FROM @sql_desc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- Intervalo mínimo entre citas del mismo equipo (vaporizador 30') ----------
SET @col_int := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_equipo' AND COLUMN_NAME = 'intervalo_minutos_entre'
);
SET @sql_int := IF(@col_int = 0,
  'ALTER TABLE cli_equipo ADD COLUMN intervalo_minutos_entre INT NOT NULL DEFAULT 0 COMMENT ''Minutos mínimos entre fin de una cita e inicio de otra (mismo equipo)'' AFTER estado',
  'SELECT 1');
PREPARE stmt FROM @sql_int; EXECUTE stmt; DEALLOCATE PREPARE stmt;
