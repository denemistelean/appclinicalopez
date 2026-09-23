-- ==============================================================================
-- PATCH 004 — Inventario FEFO + permisos INVENTARIO
-- Completa FK de cli_tratamiento_insumo → cli_insumo
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_proveedor` (
  `id_proveedor` INT NOT NULL AUTO_INCREMENT,
  `razon_social` VARCHAR(200) NOT NULL,
  `ruc` VARCHAR(20) NULL,
  `contacto` VARCHAR(120) NULL,
  `telefono` VARCHAR(40) NULL,
  `email` VARCHAR(150) NULL,
  `direccion` VARCHAR(255) NULL,
  `estado` ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_proveedor`),
  UNIQUE KEY `uk_cli_proveedor_ruc` (`ruc`)
) ENGINE=InnoDB COMMENT='Proveedores de insumos';

CREATE TABLE IF NOT EXISTS `cli_insumo` (
  `id_insumo` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `unidad` VARCHAR(30) NOT NULL DEFAULT 'UND',
  `stock_minimo` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `requiere_lote` TINYINT(1) NOT NULL DEFAULT 1,
  `id_proveedor_preferido` INT NULL,
  `estado` ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_insumo`),
  UNIQUE KEY `uk_cli_insumo_codigo` (`codigo`),
  KEY `idx_cli_insumo_prov` (`id_proveedor_preferido`),
  CONSTRAINT `fk_cli_insumo_prov` FOREIGN KEY (`id_proveedor_preferido`) REFERENCES `cli_proveedor` (`id_proveedor`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Catálogo de insumos';

CREATE TABLE IF NOT EXISTS `cli_lote` (
  `id_lote` INT NOT NULL AUTO_INCREMENT,
  `id_insumo` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `id_proveedor` INT NULL,
  `codigo_lote` VARCHAR(60) NOT NULL,
  `fecha_ingreso` DATE NOT NULL,
  `fecha_vencimiento` DATE NULL,
  `cantidad_inicial` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `cantidad_actual` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `costo_unitario` DECIMAL(10,2) NULL,
  `estado` ENUM('DISPONIBLE','AGOTADO','VENCIDO','BLOQUEADO') NOT NULL DEFAULT 'DISPONIBLE',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_lote`),
  UNIQUE KEY `uk_cli_lote_insumo_codigo_sede` (`id_insumo`, `codigo_lote`, `id_sede`),
  KEY `idx_cli_lote_sede` (`id_sede`),
  KEY `idx_cli_lote_venc` (`fecha_vencimiento`),
  KEY `idx_cli_lote_prov` (`id_proveedor`),
  CONSTRAINT `fk_cli_lote_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `cli_insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_lote_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_lote_prov` FOREIGN KEY (`id_proveedor`) REFERENCES `cli_proveedor` (`id_proveedor`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Lotes por insumo/sede (FEFO)';

CREATE TABLE IF NOT EXISTS `cli_movimiento_inventario` (
  `id_movimiento_inventario` INT NOT NULL AUTO_INCREMENT,
  `id_insumo` INT NOT NULL,
  `id_lote` INT NULL,
  `id_sede` INT NOT NULL,
  `tipo_movimiento` ENUM('INGRESO','SALIDA','AJUSTE','TRANSFERENCIA_OUT','TRANSFERENCIA_IN','DEVOLUCION') NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL,
  `motivo` VARCHAR(255) NULL,
  `referencia_tipo` VARCHAR(40) NULL COMMENT 'Ej: CITA, TRANSFERENCIA, MANUAL',
  `referencia_id` INT NULL,
  `fecha_movimiento` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_movimiento_inventario`),
  KEY `idx_cli_mov_insumo` (`id_insumo`),
  KEY `idx_cli_mov_lote` (`id_lote`),
  KEY `idx_cli_mov_sede` (`id_sede`),
  KEY `idx_cli_mov_fecha` (`fecha_movimiento`),
  CONSTRAINT `fk_cli_mov_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `cli_insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_mov_lote` FOREIGN KEY (`id_lote`) REFERENCES `cli_lote` (`id_lote`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_mov_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Kardex de movimientos de inventario';

CREATE TABLE IF NOT EXISTS `cli_transferencia_sede` (
  `id_transferencia_sede` INT NOT NULL AUTO_INCREMENT,
  `id_insumo` INT NOT NULL,
  `id_lote_origen` INT NULL,
  `id_sede_origen` INT NOT NULL,
  `id_sede_destino` INT NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL,
  `fecha_transferencia` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado` ENUM('PENDIENTE','ENVIADA','RECIBIDA','ANULADA') NOT NULL DEFAULT 'PENDIENTE',
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_transferencia_sede`),
  KEY `idx_cli_transf_insumo` (`id_insumo`),
  KEY `idx_cli_transf_origen` (`id_sede_origen`),
  KEY `idx_cli_transf_destino` (`id_sede_destino`),
  KEY `idx_cli_transf_lote` (`id_lote_origen`),
  CONSTRAINT `fk_cli_transf_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `cli_insumo` (`id_insumo`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_transf_lote` FOREIGN KEY (`id_lote_origen`) REFERENCES `cli_lote` (`id_lote`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_transf_sede_orig` FOREIGN KEY (`id_sede_origen`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_transf_sede_dest` FOREIGN KEY (`id_sede_destino`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Transferencias de stock entre sedes';

-- Completar FK diferida tratamiento ↔ insumo
SET @fk_trat_insumo := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_tratamiento_insumo'
    AND CONSTRAINT_NAME = 'fk_cli_trat_insumo_insumo'
);
SET @sql_trat_insumo := IF(@fk_trat_insumo = 0,
  'ALTER TABLE `cli_tratamiento_insumo` ADD CONSTRAINT `fk_cli_trat_insumo_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `cli_insumo` (`id_insumo`) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt_trat_insumo FROM @sql_trat_insumo;
EXECUTE stmt_trat_insumo;
DEALLOCATE PREPARE stmt_trat_insumo;

-- ---------- Permisos INVENTARIO ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'INVENTARIO', 'Inventario', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'INVENTARIO');

SET @id_mod_inv := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'INVENTARIO' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_inv, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_inventario' AS codigo, 'Ver inventario' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_inventario', 'Crear/ingresar inventario', 'CREATE' UNION ALL
  SELECT 'actualizar_inventario', 'Actualizar inventario', 'UPDATE' UNION ALL
  SELECT 'eliminar_inventario', 'Eliminar inventario', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_inv AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_inv AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_inv AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
