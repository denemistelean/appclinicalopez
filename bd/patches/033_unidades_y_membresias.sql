-- ==============================================================================
-- PATCH 033 — Empresas (cli_unidad) y membresía usuario–empresa
-- No crea sedes, tarifas, ventas, pagos, anticipos ni cajas.
-- No modifica columnas clínicas ni precios ya guardados.
-- Las columnas nuevas quedan NULL para no romper los INSERT actuales.
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_unidad` (
  `id_unidad` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `opera_finanzas` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = puede registrar finanzas. López queda en 0',
  `estado` ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_unidad`),
  UNIQUE KEY `uk_cli_unidad_codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Empresa / unidad de negocio';

INSERT INTO `cli_unidad` (`codigo`, `nombre`, `opera_finanzas`, `estado`, `estado_registro`, `id_usuario_crea`)
SELECT 'LOPEZ', 'Clínica Estética López', 0, 'ACTIVA', 'ACTIVO', 1
WHERE NOT EXISTS (SELECT 1 FROM `cli_unidad` WHERE `codigo` = 'LOPEZ');

INSERT INTO `cli_unidad` (`codigo`, `nombre`, `opera_finanzas`, `estado`, `estado_registro`, `id_usuario_crea`)
SELECT 'SORELA', 'Sorela Medic', 1, 'ACTIVA', 'ACTIVO', 1
WHERE NOT EXISTS (SELECT 1 FROM `cli_unidad` WHERE `codigo` = 'SORELA');

-- ---------- columnas de atribución (NULL: los INSERT vigentes no las envían) ----------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_sede' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_sede` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente' AND COLUMN_NAME = 'id_unidad_registro');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_paciente` ADD COLUMN `id_unidad_registro` INT NULL AFTER `id_sede_registro`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_cita` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_consulta' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_consulta` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cotizacion' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_cotizacion` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_pago` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_paquete' AND COLUMN_NAME = 'id_unidad');
SET @sql := IF(@c = 0, 'ALTER TABLE `cli_paciente_paquete` ADD COLUMN `id_unidad` INT NULL AFTER `id_sede`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Sedes existentes, por id. No se insertan sedes nuevas.
UPDATE `cli_sede` s
JOIN `cli_unidad` u ON u.codigo = 'LOPEZ'
SET s.id_unidad = u.id_unidad
WHERE s.id_sede = 1 AND s.id_unidad IS NULL;

UPDATE `cli_sede` s
JOIN `cli_unidad` u ON u.codigo = 'SORELA'
SET s.id_unidad = u.id_unidad
WHERE s.id_sede = 2 AND s.id_unidad IS NULL;

-- Atribución copiada desde la sede. Solo la columna nueva.
UPDATE `cli_cita` c
JOIN `cli_sede` s ON s.id_sede = c.id_sede
SET c.id_unidad = s.id_unidad
WHERE c.id_unidad IS NULL AND s.id_unidad IS NOT NULL;

UPDATE `cli_consulta` c
JOIN `cli_sede` s ON s.id_sede = c.id_sede
SET c.id_unidad = s.id_unidad
WHERE c.id_unidad IS NULL AND s.id_unidad IS NOT NULL;

UPDATE `cli_cotizacion` c
JOIN `cli_sede` s ON s.id_sede = c.id_sede
SET c.id_unidad = s.id_unidad
WHERE c.id_unidad IS NULL AND s.id_unidad IS NOT NULL;

UPDATE `cli_pago` p
JOIN `cli_sede` s ON s.id_sede = p.id_sede
SET p.id_unidad = s.id_unidad
WHERE p.id_unidad IS NULL AND s.id_unidad IS NOT NULL;

UPDATE `cli_paciente_paquete` pp
JOIN `cli_sede` s ON s.id_sede = pp.id_sede
SET pp.id_unidad = s.id_unidad
WHERE pp.id_unidad IS NULL AND s.id_unidad IS NOT NULL;

-- Paciente: si tiene sede de alta, hereda su empresa. Si no tiene, queda en López.
-- No se escribe id_sede_registro ni ningún otro dato del paciente.
UPDATE `cli_paciente` p
LEFT JOIN `cli_sede` s ON s.id_sede = p.id_sede_registro
JOIN `cli_unidad` lopez ON lopez.codigo = 'LOPEZ'
SET p.id_unidad_registro = COALESCE(s.id_unidad, lopez.id_unidad)
WHERE p.id_unidad_registro IS NULL;

-- ---------- membresía ----------
CREATE TABLE IF NOT EXISTS `cli_usuario_unidad` (
  `id_usuario_unidad` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `id_unidad` INT NOT NULL,
  `id_rol` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_usuario_unidad`),
  UNIQUE KEY `uk_cli_usuario_unidad` (`id_usuario`, `id_unidad`),
  KEY `idx_cli_usuario_unidad_unidad` (`id_unidad`),
  KEY `idx_cli_usuario_unidad_rol` (`id_rol`),
  CONSTRAINT `fk_cli_usuario_unidad_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_usuario_unidad_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_usuario_unidad_rol` FOREIGN KEY (`id_rol`) REFERENCES `sis_rol` (`id_rol`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Rol del usuario dentro de una empresa';

INSERT INTO `cli_usuario_unidad` (`id_usuario`, `id_unidad`, `id_rol`, `estado_registro`, `id_usuario_crea`)
SELECT u.id_usuario, un.id_unidad, u.id_rol, 'ACTIVO', u.id_usuario
FROM `sis_usuario` u
JOIN `cli_unidad` un ON un.codigo = 'LOPEZ'
WHERE u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_usuario_unidad` m
    WHERE m.id_usuario = u.id_usuario AND m.id_unidad = un.id_unidad
  );

-- ---------- índices y FKs de las columnas nuevas ----------
SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_sede' AND INDEX_NAME = 'idx_cli_sede_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_sede` ADD KEY `idx_cli_sede_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_sede' AND CONSTRAINT_NAME = 'fk_cli_sede_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_sede` ADD CONSTRAINT `fk_cli_sede_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente' AND INDEX_NAME = 'idx_cli_paciente_unidad_reg');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_paciente` ADD KEY `idx_cli_paciente_unidad_reg` (`id_unidad_registro`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente' AND CONSTRAINT_NAME = 'fk_cli_paciente_unidad_reg');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_paciente` ADD CONSTRAINT `fk_cli_paciente_unidad_reg` FOREIGN KEY (`id_unidad_registro`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND INDEX_NAME = 'idx_cli_cita_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_cita` ADD KEY `idx_cli_cita_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND CONSTRAINT_NAME = 'fk_cli_cita_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_cita` ADD CONSTRAINT `fk_cli_cita_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_consulta' AND INDEX_NAME = 'idx_cli_consulta_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_consulta` ADD KEY `idx_cli_consulta_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_consulta' AND CONSTRAINT_NAME = 'fk_cli_consulta_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_consulta` ADD CONSTRAINT `fk_cli_consulta_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cotizacion' AND INDEX_NAME = 'idx_cli_cotizacion_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_cotizacion` ADD KEY `idx_cli_cotizacion_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cotizacion' AND CONSTRAINT_NAME = 'fk_cli_cotizacion_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_cotizacion` ADD CONSTRAINT `fk_cli_cotizacion_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND INDEX_NAME = 'idx_cli_pago_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_pago` ADD KEY `idx_cli_pago_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND CONSTRAINT_NAME = 'fk_cli_pago_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_pago` ADD CONSTRAINT `fk_cli_pago_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_paquete' AND INDEX_NAME = 'idx_cli_pac_paq_unidad');
SET @sql := IF(@i = 0, 'ALTER TABLE `cli_paciente_paquete` ADD KEY `idx_cli_pac_paq_unidad` (`id_unidad`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_paquete' AND CONSTRAINT_NAME = 'fk_cli_pac_paq_unidad');
SET @sql := IF(@fk = 0, 'ALTER TABLE `cli_paciente_paquete` ADD CONSTRAINT `fk_cli_pac_paq_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
