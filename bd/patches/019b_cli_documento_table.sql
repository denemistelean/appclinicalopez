USE app_clinica_lopez;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `cli_documento` (
  `id_documento` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `id_tipo_documento` INT NOT NULL,
  `id_consulta` INT NULL,
  `id_cita` INT NULL,
  `titulo` VARCHAR(200) NULL,
  `nombre_original` VARCHAR(255) NOT NULL,
  `nombre_archivo` VARCHAR(80) NOT NULL,
  `ruta_relativa` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(120) NULL,
  `tamano_bytes` INT NULL,
  `fecha_documento` DATE NULL,
  `observaciones` VARCHAR(500) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_documento`),
  KEY `idx_cli_documento_paciente` (`id_paciente`),
  KEY `idx_cli_documento_tipo` (`id_tipo_documento`),
  KEY `idx_cli_documento_consulta` (`id_consulta`),
  KEY `idx_cli_documento_cita` (`id_cita`),
  KEY `idx_cli_documento_fecha` (`fecha_documento`),
  CONSTRAINT `fk_cli_documento_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_documento_tipo` FOREIGN KEY (`id_tipo_documento`) REFERENCES `cli_tipo_documento` (`id_tipo_documento`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_documento_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `cli_consulta` (`id_consulta`) ON DELETE SET NULL,
  CONSTRAINT `fk_cli_documento_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Documentos escaneados / archivos del paciente';
