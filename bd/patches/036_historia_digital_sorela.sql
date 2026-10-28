-- Historia digital de Sorela Medic. No altera las tablas clínicas de López.
-- La ficha demográfica sigue en cli_paciente. Aquí vive lo propio de Sorela.

CREATE TABLE IF NOT EXISTS `cli_historia_digital` (
  `id_historia_digital` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `id_paciente` INT NOT NULL,
  `codigo` VARCHAR(20) NOT NULL,
  `procedencia` VARCHAR(40) NULL,
  `detalle_referido` VARCHAR(255) NULL,
  `campana` VARCHAR(150) NULL,
  `enfermedades` TEXT NULL,
  `alergias` TEXT NULL,
  `medicamentos_actuales` TEXT NULL,
  `tratamientos_previos` TEXT NULL,
  `hipertension` TINYINT NULL,
  `diabetes` TINYINT NULL,
  `anticonceptivos` TINYINT NULL,
  `tabaquismo` TINYINT NULL,
  `observaciones_antecedentes` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_historia_digital`),
  UNIQUE KEY `uk_hd_unidad_paciente` (`id_unidad`, `id_paciente`),
  UNIQUE KEY `uk_hd_unidad_codigo` (`id_unidad`, `codigo`),
  CONSTRAINT `fk_hd_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Cabecera de historia digital Sorela';

CREATE TABLE IF NOT EXISTS `cli_hd_evaluacion` (
  `id_evaluacion` INT NOT NULL AUTO_INCREMENT,
  `id_historia_digital` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `motivo` VARCHAR(255) NULL,
  `objetivos` TEXT NULL,
  `zonas` VARCHAR(255) NULL,
  `hallazgos` TEXT NULL,
  `plan_tratamiento` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_evaluacion`),
  KEY `idx_hd_eval_historia` (`id_historia_digital`, `fecha`),
  CONSTRAINT `fk_hd_eval_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Evaluaciones de la historia digital';

CREATE TABLE IF NOT EXISTS `cli_hd_cirugia` (
  `id_cirugia` INT NOT NULL AUTO_INCREMENT,
  `id_historia_digital` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `id_personal` INT NULL,
  `cirujano` VARCHAR(180) NULL,
  `zonas` VARCHAR(255) NULL,
  `indicaciones` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_cirugia`),
  KEY `idx_hd_cir_historia` (`id_historia_digital`, `fecha`),
  CONSTRAINT `fk_hd_cir_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Cirugías realizadas registradas en historia digital';

CREATE TABLE IF NOT EXISTS `cli_hd_paquete` (
  `id_hd_paquete` INT NOT NULL AUTO_INCREMENT,
  `id_historia_digital` INT NOT NULL,
  `id_item` INT NULL,
  `nombre` VARCHAR(180) NOT NULL,
  `sesiones_total` INT NOT NULL,
  `sesiones_usadas` INT NOT NULL DEFAULT 0,
  `precio_acordado` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_hd_paquete`),
  KEY `idx_hd_paq_historia` (`id_historia_digital`),
  CONSTRAINT `fk_hd_paq_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Paquetes y sesiones de la historia digital';
