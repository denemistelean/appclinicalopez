-- ==============================================================================
-- PATCH 009 — Transversales: consentimientos, fotos, facturación, notificaciones,
--             reportes (+ permisos por módulo)
-- ==============================================================================
USE app_clinica_lopez;

-- ---------- Consentimientos ----------
CREATE TABLE IF NOT EXISTS `cli_consentimiento_plantilla` (
  `id_consentimiento_plantilla` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `version` VARCHAR(20) NOT NULL DEFAULT '1.0',
  `contenido_html` MEDIUMTEXT NOT NULL,
  `id_tratamiento` INT NULL,
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consentimiento_plantilla`),
  KEY `idx_cli_cons_plant_trat` (`id_tratamiento`),
  CONSTRAINT `fk_cli_cons_plant_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Plantillas de consentimiento informado';

CREATE TABLE IF NOT EXISTS `cli_consentimiento` (
  `id_consentimiento` INT NOT NULL AUTO_INCREMENT,
  `id_consentimiento_plantilla` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `id_sede` INT NULL,
  `id_cita` INT NULL,
  `id_consulta` INT NULL,
  `fecha_firma` DATETIME NULL,
  `firma_url` VARCHAR(500) NULL,
  `contenido_snapshot_html` MEDIUMTEXT NULL COMMENT 'Copia inmutable al firmar',
  `estado` ENUM('PENDIENTE','FIRMADO','RECHAZADO','ANULADO') NOT NULL DEFAULT 'PENDIENTE',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consentimiento`),
  KEY `idx_cli_cons_paciente` (`id_paciente`),
  KEY `idx_cli_cons_plantilla` (`id_consentimiento_plantilla`),
  KEY `idx_cli_cons_cita` (`id_cita`),
  KEY `idx_cli_cons_consulta` (`id_consulta`),
  KEY `idx_cli_cons_sede` (`id_sede`),
  CONSTRAINT `fk_cli_cons_plantilla` FOREIGN KEY (`id_consentimiento_plantilla`) REFERENCES `cli_consentimiento_plantilla` (`id_consentimiento_plantilla`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cons_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cons_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_cons_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_cons_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Consentimientos firmados / pendientes';

-- ---------- Fotos de evolución ----------
CREATE TABLE IF NOT EXISTS `cli_foto_evolucion` (
  `id_foto_evolucion` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_sede` INT NULL,
  `id_consulta` INT NULL,
  `id_cita` INT NULL,
  `fecha_foto` DATETIME NOT NULL,
  `tipo_vista` VARCHAR(60) NULL COMMENT 'FRENTE, PERFIL, ANTES, DESPUES',
  `ruta_archivo` VARCHAR(500) NOT NULL,
  `miniatura_url` VARCHAR(500) NULL,
  `descripcion` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_foto_evolucion`),
  KEY `idx_cli_foto_paciente` (`id_paciente`),
  KEY `idx_cli_foto_consulta` (`id_consulta`),
  KEY `idx_cli_foto_cita` (`id_cita`),
  KEY `idx_cli_foto_sede` (`id_sede`),
  CONSTRAINT `fk_cli_foto_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_foto_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_foto_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_foto_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Fotos de evolución clínica';

-- ---------- Facturación ----------
CREATE TABLE IF NOT EXISTS `cli_cotizacion` (
  `id_cotizacion` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `id_consulta` INT NULL,
  `numero` VARCHAR(40) NULL,
  `fecha_cotizacion` DATE NOT NULL,
  `vigencia_hasta` DATE NULL,
  `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `descuento` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `igv` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','VENCIDA','ANULADA') NOT NULL DEFAULT 'BORRADOR',
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cotizacion`),
  UNIQUE KEY `uk_cli_cotizacion_numero` (`numero`),
  KEY `idx_cli_cotiz_paciente` (`id_paciente`),
  KEY `idx_cli_cotiz_sede` (`id_sede`),
  KEY `idx_cli_cotiz_consulta` (`id_consulta`),
  CONSTRAINT `fk_cli_cotiz_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cotiz_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cotiz_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Cotizaciones / presupuestos';

CREATE TABLE IF NOT EXISTS `cli_cotizacion_detalle` (
  `id_cotizacion_detalle` INT NOT NULL AUTO_INCREMENT,
  `id_cotizacion` INT NOT NULL,
  `id_tratamiento` INT NULL,
  `id_paquete` INT NULL,
  `descripcion` VARCHAR(255) NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `precio_unitario` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `descuento` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cotizacion_detalle`),
  KEY `idx_cli_cotiz_det_cab` (`id_cotizacion`),
  KEY `idx_cli_cotiz_det_trat` (`id_tratamiento`),
  KEY `idx_cli_cotiz_det_paq` (`id_paquete`),
  CONSTRAINT `fk_cli_cotiz_det_cab` FOREIGN KEY (`id_cotizacion`) REFERENCES `cli_cotizacion` (`id_cotizacion`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cotiz_det_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_cotiz_det_paq` FOREIGN KEY (`id_paquete`) REFERENCES `cli_paquete` (`id_paquete`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Detalle de cotización';

CREATE TABLE IF NOT EXISTS `cli_pago` (
  `id_pago` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_sede` INT NOT NULL,
  `id_cotizacion` INT NULL,
  `id_cita` INT NULL,
  `id_paciente_paquete` INT NULL,
  `fecha_pago` DATETIME NOT NULL,
  `monto` DECIMAL(10,2) NOT NULL,
  `metodo_pago` ENUM('EFECTIVO','TARJETA','TRANSFERENCIA','YAPE','PLIN','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  `referencia` VARCHAR(100) NULL,
  `concepto` VARCHAR(255) NULL,
  `estado` ENUM('REGISTRADO','ANULADO') NOT NULL DEFAULT 'REGISTRADO',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_pago`),
  KEY `idx_cli_pago_paciente` (`id_paciente`),
  KEY `idx_cli_pago_sede` (`id_sede`),
  KEY `idx_cli_pago_cotiz` (`id_cotizacion`),
  KEY `idx_cli_pago_cita` (`id_cita`),
  KEY `idx_cli_pago_paquete` (`id_paciente_paquete`),
  CONSTRAINT `fk_cli_pago_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_pago_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_pago_cotiz` FOREIGN KEY (`id_cotizacion`) REFERENCES `cli_cotizacion` (`id_cotizacion`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_pago_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_pago_paquete` FOREIGN KEY (`id_paciente_paquete`) REFERENCES `cli_paciente_paquete` (`id_paciente_paquete`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Pagos / cobros';

-- ---------- Notificaciones ----------
CREATE TABLE IF NOT EXISTS `cli_notificacion` (
  `id_notificacion` INT NOT NULL AUTO_INCREMENT,
  `id_usuario_destino` INT NULL,
  `id_paciente` INT NULL,
  `id_sede` INT NULL,
  `canal` ENUM('SISTEMA','EMAIL','SMS','WHATSAPP') NOT NULL DEFAULT 'SISTEMA',
  `tipo` VARCHAR(60) NOT NULL COMMENT 'CITA_RECORDATORIO, STOCK_BAJO, etc.',
  `titulo` VARCHAR(150) NOT NULL,
  `mensaje` TEXT NOT NULL,
  `referencia_tipo` VARCHAR(40) NULL,
  `referencia_id` INT NULL,
  `fecha_programada` DATETIME NULL,
  `fecha_envio` DATETIME NULL,
  `leida` TINYINT(1) NOT NULL DEFAULT 0,
  `estado` ENUM('PENDIENTE','ENVIADA','FALLIDA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_notificacion`),
  KEY `idx_cli_notif_usuario` (`id_usuario_destino`),
  KEY `idx_cli_notif_paciente` (`id_paciente`),
  KEY `idx_cli_notif_sede` (`id_sede`),
  KEY `idx_cli_notif_estado` (`estado`),
  CONSTRAINT `fk_cli_notif_usuario` FOREIGN KEY (`id_usuario_destino`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_notif_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_notif_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Cola / historial de notificaciones';

-- ==============================================================================
-- Permisos por módulo transversal
-- ==============================================================================

-- CONSENTIMIENTOS
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'CONSENTIMIENTOS', 'Consentimientos', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'CONSENTIMIENTOS');

SET @id_mod_cons := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'CONSENTIMIENTOS' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_cons, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_consentimiento' AS codigo, 'Ver consentimientos' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_consentimiento', 'Crear consentimientos', 'CREATE' UNION ALL
  SELECT 'actualizar_consentimiento', 'Actualizar consentimientos', 'UPDATE' UNION ALL
  SELECT 'eliminar_consentimiento', 'Eliminar consentimientos', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_cons AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_cons AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_cons AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';

-- FOTOS_EVOLUCION
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'FOTOS_EVOLUCION', 'Fotos de evolución', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'FOTOS_EVOLUCION');

SET @id_mod_fotos := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'FOTOS_EVOLUCION' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_fotos, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_foto_evolucion' AS codigo, 'Ver fotos de evolución' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_foto_evolucion', 'Subir fotos de evolución', 'CREATE' UNION ALL
  SELECT 'actualizar_foto_evolucion', 'Actualizar fotos de evolución', 'UPDATE' UNION ALL
  SELECT 'eliminar_foto_evolucion', 'Eliminar fotos de evolución', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_fotos AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_fotos AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_fotos AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';

-- FACTURACION
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'FACTURACION', 'Facturación', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'FACTURACION');

SET @id_mod_fact := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'FACTURACION' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_fact, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_facturacion' AS codigo, 'Ver cotizaciones y pagos' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_facturacion', 'Crear cotizaciones/pagos', 'CREATE' UNION ALL
  SELECT 'actualizar_facturacion', 'Actualizar facturación', 'UPDATE' UNION ALL
  SELECT 'eliminar_facturacion', 'Anular facturación', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_fact AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_fact AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_fact AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';

-- NOTIFICACIONES
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'NOTIFICACIONES', 'Notificaciones', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'NOTIFICACIONES');

SET @id_mod_notif := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'NOTIFICACIONES' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_notif, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_notificacion' AS codigo, 'Ver notificaciones' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_notificacion', 'Crear notificaciones', 'CREATE' UNION ALL
  SELECT 'actualizar_notificacion', 'Actualizar notificaciones', 'UPDATE' UNION ALL
  SELECT 'eliminar_notificacion', 'Eliminar notificaciones', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_notif AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_notif AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_notif AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';

-- REPORTES (solo lectura)
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'REPORTES', 'Reportes', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'REPORTES');

SET @id_mod_rep := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'REPORTES' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_rep, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_reporte' AS codigo, 'Ver reportes' AS descripcion_txt, 'READ' AS tipo
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_rep AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_rep AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_rep AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
