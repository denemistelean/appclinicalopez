-- PATCH 027 — Filiación del paciente + contactos de emergencia
USE app_clinica_lopez;

-- Filiación (opcionales)
ALTER TABLE `cli_paciente`
  ADD COLUMN IF NOT EXISTS `educacion` VARCHAR(120) NULL AFTER `ocupacion`,
  ADD COLUMN IF NOT EXISTS `religion` VARCHAR(80) NULL AFTER `educacion`,
  ADD COLUMN IF NOT EXISTS `identidad_genero` VARCHAR(80) NULL AFTER `religion`,
  ADD COLUMN IF NOT EXISTS `orientacion_sexual` VARCHAR(80) NULL AFTER `identidad_genero`,
  ADD COLUMN IF NOT EXISTS `idioma` VARCHAR(80) NULL AFTER `orientacion_sexual`,
  ADD COLUMN IF NOT EXISTS `como_nos_conocio` VARCHAR(150) NULL AFTER `idioma`,
  ADD COLUMN IF NOT EXISTS `seguro_salud` VARCHAR(120) NULL AFTER `como_nos_conocio`,
  ADD COLUMN IF NOT EXISTS `numero_seguro` VARCHAR(80) NULL AFTER `seguro_salud`,
  ADD COLUMN IF NOT EXISTS `grupo_sanguineo` VARCHAR(10) NULL AFTER `numero_seguro`,
  ADD COLUMN IF NOT EXISTS `contacto_emergencia_parentesco` VARCHAR(80) NULL AFTER `contacto_emergencia_telefono`,
  ADD COLUMN IF NOT EXISTS `contacto_emergencia_direccion` VARCHAR(255) NULL AFTER `contacto_emergencia_parentesco`,
  ADD COLUMN IF NOT EXISTS `contacto_emergencia_datos` VARCHAR(500) NULL AFTER `contacto_emergencia_direccion`;

-- Varios contactos de emergencia por paciente
CREATE TABLE IF NOT EXISTS `cli_paciente_contacto_emergencia` (
  `id_paciente_contacto_emergencia` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `parentesco` VARCHAR(80) NULL,
  `telefono` VARCHAR(40) NULL,
  `direccion` VARCHAR(255) NULL,
  `datos_adicionales` VARCHAR(500) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_contacto_emergencia`),
  KEY `idx_cli_pac_contacto_pac` (`id_paciente`),
  CONSTRAINT `fk_cli_pac_contacto_pac`
    FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Contactos de emergencia del paciente';

-- Migrar contacto legacy (si existía) a la nueva tabla
INSERT INTO `cli_paciente_contacto_emergencia`
  (`id_paciente`, `nombre`, `parentesco`, `telefono`, `direccion`, `datos_adicionales`, `id_usuario_crea`)
SELECT p.id_paciente,
       p.contacto_emergencia_nombre,
       p.contacto_emergencia_parentesco,
       p.contacto_emergencia_telefono,
       p.contacto_emergencia_direccion,
       p.contacto_emergencia_datos,
       1
FROM cli_paciente p
WHERE p.estado_registro = 'ACTIVO'
  AND IFNULL(TRIM(p.contacto_emergencia_nombre), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM cli_paciente_contacto_emergencia c
    WHERE c.id_paciente = p.id_paciente AND c.estado_registro = 'ACTIVO'
  );
