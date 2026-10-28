-- PATCH 043 — Devolución al baja, venta única por plan, vínculo usuario↔ cosmiatra
-- Idempotente donde aplica.

-- ---------- tipo_pago: DEVOLUCION ----------
ALTER TABLE `cli_pago`
  MODIFY COLUMN `tipo_pago` ENUM('ADELANTO','ABONO','CANCELACION','DEVOLUCION') NULL
  COMMENT 'Adelanto/abono/liquidación o devolución al dar de baja';

-- ---------- Venta (una por plan contratado) ----------
CREATE TABLE IF NOT EXISTS `cli_hd_venta` (
  `id_hd_venta` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `id_hd_paquete` INT NOT NULL,
  `nombre` VARCHAR(180) NOT NULL,
  `monto_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado` ENUM('ABIERTA','CERRADA','ANULADA') NOT NULL DEFAULT 'ABIERTA',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_hd_venta`),
  UNIQUE KEY `uk_hd_venta_paquete` (`id_hd_paquete`),
  KEY `idx_hd_venta_paciente` (`id_paciente`),
  KEY `idx_hd_venta_unidad` (`id_unidad`),
  CONSTRAINT `fk_hd_venta_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_venta_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_venta_paquete` FOREIGN KEY (`id_hd_paquete`) REFERENCES `cli_hd_paquete` (`id_hd_paquete`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Venta comercial del plan; los abonos no crean ventas adicionales';

SET @col_venta := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'id_hd_venta'
);
SET @sql_venta := IF(@col_venta = 0,
  'ALTER TABLE cli_pago ADD COLUMN id_hd_venta INT NULL AFTER id_hd_paquete',
  'SELECT 1');
PREPARE stmt FROM @sql_venta; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_venta := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND CONSTRAINT_NAME = 'fk_cli_pago_hd_venta'
);
SET @sql_fk := IF(@fk_venta = 0,
  'ALTER TABLE cli_pago ADD CONSTRAINT fk_cli_pago_hd_venta FOREIGN KEY (id_hd_venta) REFERENCES cli_hd_venta (id_hd_venta) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_fk; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- Usuario ↔ personal (cosmiatra) ----------
SET @col_pers := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sis_usuario' AND COLUMN_NAME = 'id_personal'
);
SET @sql_pers := IF(@col_pers = 0,
  'ALTER TABLE sis_usuario ADD COLUMN id_personal INT NULL AFTER id_rol, ADD KEY idx_sis_usuario_personal (id_personal)',
  'SELECT 1');
PREPARE stmt FROM @sql_pers; EXECUTE stmt; DEALLOCATE PREPARE stmt;
