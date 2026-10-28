-- Catálogo de Sorela: servicios, paquetes, vigencias de precio y tecnologías.
-- No altera el catálogo de procedimientos de López.
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_catalogo_item` (
  `id_item` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `tipo` ENUM('servicio','paquete') NOT NULL,
  `codigo` VARCHAR(20) NOT NULL,
  `categoria` VARCHAR(80) NOT NULL,
  `nombre` VARCHAR(180) NOT NULL,
  `sesiones` INT NULL,
  `nota` VARCHAR(500) NULL,
  `sin_tarifa` TINYINT(1) NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_item`),
  UNIQUE KEY `uk_cli_catalogo_codigo` (`id_unidad`, `codigo`),
  KEY `idx_cli_catalogo_tipo` (`id_unidad`, `tipo`),
  CONSTRAINT `fk_cli_catalogo_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_catalogo_vigencia` (
  `id_vigencia` INT NOT NULL AUTO_INCREMENT,
  `id_item` INT NOT NULL,
  `monto` DECIMAL(10,2) NOT NULL,
  `vigente_desde` DATE NOT NULL,
  `vigente_hasta` DATE NULL,
  `motivo` VARCHAR(255) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_vigencia`),
  KEY `idx_cli_vigencia_item` (`id_item`, `vigente_desde`),
  CONSTRAINT `fk_cli_vigencia_item` FOREIGN KEY (`id_item`) REFERENCES `cli_catalogo_item` (`id_item`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_catalogo_componente` (
  `id_componente` INT NOT NULL AUTO_INCREMENT,
  `id_paquete` INT NOT NULL,
  `id_servicio` INT NOT NULL,
  `cantidad` INT NOT NULL,
  PRIMARY KEY (`id_componente`),
  UNIQUE KEY `uk_cli_catalogo_comp` (`id_paquete`, `id_servicio`),
  CONSTRAINT `fk_cli_comp_paquete` FOREIGN KEY (`id_paquete`) REFERENCES `cli_catalogo_item` (`id_item`),
  CONSTRAINT `fk_cli_comp_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `cli_catalogo_item` (`id_item`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_catalogo_tecnologia` (
  `id_tecnologia` INT NOT NULL AUTO_INCREMENT,
  `id_unidad` INT NOT NULL,
  `codigo` VARCHAR(20) NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  `serie` VARCHAR(80) NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  PRIMARY KEY (`id_tecnologia`),
  UNIQUE KEY `uk_cli_tecnologia` (`id_unidad`, `codigo`),
  CONSTRAINT `fk_cli_tecnologia_unidad` FOREIGN KEY (`id_unidad`) REFERENCES `cli_unidad` (`id_unidad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
