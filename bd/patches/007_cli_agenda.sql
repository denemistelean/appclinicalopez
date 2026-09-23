-- ==============================================================================
-- PATCH 007 — Agenda: citas, lista de espera, paquetes paciente + permisos AGENDA
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_cita` (
  `id_cita` INT NOT NULL AUTO_INCREMENT,
  `id_sede` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `id_personal` INT NOT NULL,
  `id_tratamiento` INT NOT NULL,
  `id_sala` INT NULL,
  `id_equipo` INT NULL,
  `id_paciente_paquete` INT NULL COMMENT 'FK lógica; tabla definida abajo',
  `fecha_cita` DATE NOT NULL,
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `estado` ENUM('PROGRAMADA','CONFIRMADA','EN_ATENCION','COMPLETADA','CANCELADA','NO_ASISTIO','REPROGRAMADA') NOT NULL DEFAULT 'PROGRAMADA',
  `motivo_cancelacion` VARCHAR(255) NULL,
  `notas` TEXT NULL,
  `precio_acordado` DECIMAL(10,2) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cita`),
  KEY `idx_cli_cita_sede_fecha` (`id_sede`, `fecha_cita`),
  KEY `idx_cli_cita_personal_fecha` (`id_personal`, `fecha_cita`),
  KEY `idx_cli_cita_paciente` (`id_paciente`),
  KEY `idx_cli_cita_trat` (`id_tratamiento`),
  KEY `idx_cli_cita_sala` (`id_sala`),
  KEY `idx_cli_cita_equipo` (`id_equipo`),
  KEY `idx_cli_cita_paquete` (`id_paciente_paquete`),
  CONSTRAINT `fk_cli_cita_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_personal` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_sala` FOREIGN KEY (`id_sala`) REFERENCES `cli_sala` (`id_sala`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_cita_equipo` FOREIGN KEY (`id_equipo`) REFERENCES `cli_equipo` (`id_equipo`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Citas / agenda clínica';

CREATE TABLE IF NOT EXISTS `cli_lista_espera` (
  `id_lista_espera` INT NOT NULL AUTO_INCREMENT,
  `id_sede` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `id_tratamiento` INT NULL,
  `id_personal_preferido` INT NULL,
  `fecha_preferida` DATE NULL,
  `turno_preferido` ENUM('MANANA','TARDE','NOCHE','CUALQUIERA') NOT NULL DEFAULT 'CUALQUIERA',
  `prioridad` TINYINT NOT NULL DEFAULT 5,
  `estado` ENUM('PENDIENTE','CONTACTADO','AGENDADO','CANCELADO','VENCIDO') NOT NULL DEFAULT 'PENDIENTE',
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_lista_espera`),
  KEY `idx_cli_espera_sede` (`id_sede`),
  KEY `idx_cli_espera_paciente` (`id_paciente`),
  KEY `idx_cli_espera_trat` (`id_tratamiento`),
  KEY `idx_cli_espera_personal` (`id_personal_preferido`),
  CONSTRAINT `fk_cli_espera_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_espera_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_espera_trat` FOREIGN KEY (`id_tratamiento`) REFERENCES `cli_tratamiento` (`id_tratamiento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_espera_personal` FOREIGN KEY (`id_personal_preferido`) REFERENCES `cli_personal` (`id_personal`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Lista de espera para agenda';

CREATE TABLE IF NOT EXISTS `cli_paciente_paquete` (
  `id_paciente_paquete` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_paquete` INT NOT NULL,
  `id_sede` INT NULL,
  `fecha_compra` DATE NOT NULL,
  `fecha_vencimiento` DATE NULL,
  `sesiones_total` INT NOT NULL,
  `sesiones_usadas` INT NOT NULL DEFAULT 0,
  `precio_pagado` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `estado` ENUM('VIGENTE','AGOTADO','VENCIDO','ANULADO') NOT NULL DEFAULT 'VIGENTE',
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_paquete`),
  KEY `idx_cli_pac_paq_paciente` (`id_paciente`),
  KEY `idx_cli_pac_paq_paquete` (`id_paquete`),
  KEY `idx_cli_pac_paq_sede` (`id_sede`),
  CONSTRAINT `fk_cli_pac_paq_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_pac_paq_paquete` FOREIGN KEY (`id_paquete`) REFERENCES `cli_paquete` (`id_paquete`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_pac_paq_sede` FOREIGN KEY (`id_sede`) REFERENCES `cli_sede` (`id_sede`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Paquetes adquiridos por paciente';

-- FK diferida cita → paciente_paquete (tabla creada después de cli_cita)
SET @fk_cita_paq := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_cita'
    AND CONSTRAINT_NAME = 'fk_cli_cita_paciente_paquete'
);
SET @sql_cita_paq := IF(@fk_cita_paq = 0,
  'ALTER TABLE `cli_cita` ADD CONSTRAINT `fk_cli_cita_paciente_paquete` FOREIGN KEY (`id_paciente_paquete`) REFERENCES `cli_paciente_paquete` (`id_paciente_paquete`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt_cita_paq FROM @sql_cita_paq;
EXECUTE stmt_cita_paq;
DEALLOCATE PREPARE stmt_cita_paq;

-- ---------- Permisos AGENDA ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'AGENDA', 'Agenda', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'AGENDA');

SET @id_mod_agenda := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'AGENDA' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_agenda, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_cita' AS codigo, 'Ver agenda/citas' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_cita', 'Crear citas', 'CREATE' UNION ALL
  SELECT 'actualizar_cita', 'Actualizar citas', 'UPDATE' UNION ALL
  SELECT 'eliminar_cita', 'Eliminar/cancelar citas', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_agenda AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_agenda AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_agenda AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
