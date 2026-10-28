-- Atención de cita de Sorela: sesión clínica, componentes del paquete,
-- medidas y movimientos de descuento o restitución.
-- Las marcas siguen en cli_mapa_marcador, ligadas a la cita.

CREATE TABLE IF NOT EXISTS `cli_hd_paquete_componente` (
  `id_hd_componente` INT NOT NULL AUTO_INCREMENT,
  `id_hd_paquete` INT NOT NULL,
  `id_servicio` INT NULL,
  `nombre` VARCHAR(180) NOT NULL,
  `sesiones_total` INT NOT NULL,
  `sesiones_usadas` INT NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_hd_componente`),
  KEY `idx_hd_comp_paquete` (`id_hd_paquete`),
  CONSTRAINT `fk_hd_comp_paquete` FOREIGN KEY (`id_hd_paquete`) REFERENCES `cli_hd_paquete` (`id_hd_paquete`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Contador por componente de un paquete ya contratado';

CREATE TABLE IF NOT EXISTS `cli_hd_atencion` (
  `id_atencion` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `id_historia_digital` INT NOT NULL,
  `id_cita` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `id_personal` INT NULL,
  `id_hd_paquete` INT NULL,
  `id_hd_componente` INT NULL,
  `anamnesis` TEXT NULL,
  `zona` VARCHAR(180) NULL,
  `lado` VARCHAR(20) NULL,
  `parametros` TEXT NULL,
  `evolucion` TEXT NULL,
  `incidencias` TEXT NULL,
  `indicaciones` TEXT NULL,
  `proxima_revision` DATE NULL,
  `estado` ENUM('BORRADOR','FINALIZADA') NOT NULL DEFAULT 'BORRADOR',
  `fecha_cierre` DATETIME NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_atencion`),
  UNIQUE KEY `uk_hd_atencion_cita` (`id_cita`),
  KEY `idx_hd_atencion_historia` (`id_historia_digital`),
  CONSTRAINT `fk_hd_atencion_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_atencion_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_atencion_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Registro clínico de una cita de Sorela';

CREATE TABLE IF NOT EXISTS `cli_hd_atencion_tecnologia` (
  `id_atencion_tecnologia` INT NOT NULL AUTO_INCREMENT,
  `id_atencion` INT NOT NULL,
  `id_tecnologia` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_atencion_tecnologia`),
  UNIQUE KEY `uk_hd_atencion_tec` (`id_atencion`, `id_tecnologia`),
  CONSTRAINT `fk_hd_at_tec_atencion` FOREIGN KEY (`id_atencion`) REFERENCES `cli_hd_atencion` (`id_atencion`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_at_tec_item` FOREIGN KEY (`id_tecnologia`) REFERENCES `cli_catalogo_tecnologia` (`id_tecnologia`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Tecnologías usadas en la atención; no consumen sesión';

CREATE TABLE IF NOT EXISTS `cli_hd_medida` (
  `id_medida` INT NOT NULL AUTO_INCREMENT,
  `id_historia_digital` INT NOT NULL,
  `id_atencion` INT NULL,
  `fecha` DATE NOT NULL,
  `peso` DECIMAL(6,2) NULL,
  `agua_corporal` DECIMAL(6,2) NULL,
  `grasa_corporal` DECIMAL(6,2) NULL,
  `masa_muscular` DECIMAL(6,2) NULL,
  `abdomen_alto` DECIMAL(6,2) NULL,
  `cintura` DECIMAL(6,2) NULL,
  `ombligo` DECIMAL(6,2) NULL,
  `cadera` DECIMAL(6,2) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_medida`),
  KEY `idx_hd_medida_historia` (`id_historia_digital`, `fecha`),
  CONSTRAINT `fk_hd_medida_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_medida_atencion` FOREIGN KEY (`id_atencion`) REFERENCES `cli_hd_atencion` (`id_atencion`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Medidas corporales de Sorela, una fila por toma';

CREATE TABLE IF NOT EXISTS `cli_hd_sesion_movimiento` (
  `id_movimiento` INT NOT NULL AUTO_INCREMENT,
  `id_hd_paquete` INT NOT NULL,
  `id_hd_componente` INT NULL,
  `id_atencion` INT NULL,
  `tipo` ENUM('DESCUENTO','RESTITUCION') NOT NULL,
  `motivo` VARCHAR(255) NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id_usuario` INT NOT NULL,
  PRIMARY KEY (`id_movimiento`),
  KEY `idx_hd_mov_paquete` (`id_hd_paquete`),
  KEY `idx_hd_mov_atencion` (`id_atencion`),
  CONSTRAINT `fk_hd_mov_paquete` FOREIGN KEY (`id_hd_paquete`) REFERENCES `cli_hd_paquete` (`id_hd_paquete`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_mov_atencion` FOREIGN KEY (`id_atencion`) REFERENCES `cli_hd_atencion` (`id_atencion`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Descuento o restitución de sesión, con motivo y usuario';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT DISTINCT p.id_rol, mapa.id_accion, 'ACTIVO'
FROM sis_permiso p
JOIN sis_accion paciente ON paciente.id_accion = p.id_accion
  AND paciente.codigo_accion = 'actualizar_paciente'
  AND paciente.estado_registro = 'ACTIVO'
JOIN sis_accion mapa ON mapa.codigo_accion IN (
  'ver_mapa_corporal', 'crear_mapa_marcador', 'actualizar_mapa_marcador', 'eliminar_mapa_marcador'
) AND mapa.estado_registro = 'ACTIVO'
WHERE p.estado_registro = 'ACTIVO';
