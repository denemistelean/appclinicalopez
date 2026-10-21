-- PATCH 026 — Certificaciones libres (+ PDF) y credenciales del personal
USE app_clinica_lopez;

-- Certificados profesionales (nombre libre, no ligados a un tratamiento)
CREATE TABLE IF NOT EXISTS `cli_personal_certificacion` (
  `id_personal_certificacion` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `nombre_certificado` VARCHAR(255) NOT NULL,
  `fecha_certificacion` DATE NULL,
  `fecha_vencimiento` DATE NULL,
  `observaciones` VARCHAR(500) NULL,
  `archivo_ruta` VARCHAR(500) NULL COMMENT 'Ruta relativa bajo DOCUMENTOS_ROOT',
  `archivo_nombre` VARCHAR(255) NULL,
  `archivo_mime` VARCHAR(100) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_certificacion`),
  KEY `idx_cli_pers_cert_personal` (`id_personal`),
  CONSTRAINT `fk_cli_pers_cert_personal`
    FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Certificaciones / diplomas del personal (nombre libre + PDF)';

-- Credenciales profesionales (CMP, RNE, etc.; varias del mismo tipo)
CREATE TABLE IF NOT EXISTS `cli_personal_credencial` (
  `id_personal_credencial` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `tipo` VARCHAR(40) NOT NULL COMMENT 'CMP, RNE, COP, etc.',
  `numero` VARCHAR(80) NOT NULL,
  `entidad` VARCHAR(180) NULL COMMENT 'Emisor / colegio',
  `fecha_emision` DATE NULL,
  `fecha_vencimiento` DATE NULL,
  `observaciones` VARCHAR(500) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_credencial`),
  KEY `idx_cli_pers_cred_personal` (`id_personal`),
  KEY `idx_cli_pers_cred_tipo` (`id_personal`, `tipo`),
  CONSTRAINT `fk_cli_pers_cred_personal`
    FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Credenciales profesionales (CMP, RNE, etc.)';

-- Especialidad Cirugía Plástica (si no existe)
INSERT INTO `cli_especialidad` (`codigo`, `nombre`, `estado_registro`, `id_usuario_crea`)
SELECT 'CIRUGIA_PLASTICA', 'CIRUGÍA PLÁSTICA', 'ACTIVO', 1
WHERE NOT EXISTS (
  SELECT 1 FROM cli_especialidad
  WHERE UPPER(TRIM(nombre)) = 'CIRUGÍA PLÁSTICA' AND estado_registro = 'ACTIVO'
);

-- Dra. Soraya López Aguinaga
INSERT INTO `cli_personal`
  (`documento`, `tipo_documento`, `nombres`, `apellidos`, `especialidad`, `telefono`, `email`,
   `id_sede_principal`, `estado`, `observaciones`, `estado_registro`, `id_usuario_crea`)
SELECT '41034', 'DNI', 'SORAYA', 'LOPEZ AGUINAGA', 'CIRUGÍA PLÁSTICA', NULL, NULL,
       (SELECT id_sede FROM cli_sede WHERE estado_registro = 'ACTIVO' ORDER BY id_sede LIMIT 1),
       'ACTIVO', 'Médico cirujano plástico', 'ACTIVO', 1
WHERE NOT EXISTS (
  SELECT 1 FROM cli_personal
  WHERE documento = '41034' AND estado_registro = 'ACTIVO'
);

SET @id_soraya := (
  SELECT id_personal FROM cli_personal
  WHERE documento = '41034' AND estado_registro = 'ACTIVO' LIMIT 1
);
SET @id_esp_cp := (
  SELECT id_especialidad FROM cli_especialidad
  WHERE UPPER(TRIM(nombre)) = 'CIRUGÍA PLÁSTICA' AND estado_registro = 'ACTIVO' LIMIT 1
);
SET @id_sede1 := (SELECT id_sede FROM cli_sede WHERE estado_registro = 'ACTIVO' ORDER BY id_sede LIMIT 1);

INSERT INTO `cli_personal_especialidad` (`id_personal`, `id_especialidad`, `estado_registro`, `id_usuario_crea`)
SELECT @id_soraya, @id_esp_cp, 'ACTIVO', 1
WHERE @id_soraya IS NOT NULL AND @id_esp_cp IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_personal_especialidad
    WHERE id_personal = @id_soraya AND id_especialidad = @id_esp_cp AND estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_personal_sede` (`id_personal`, `id_sede`, `es_principal`, `estado_registro`, `id_usuario_crea`)
SELECT @id_soraya, @id_sede1, 1, 'ACTIVO', 1
WHERE @id_soraya IS NOT NULL AND @id_sede1 IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_personal_sede
    WHERE id_personal = @id_soraya AND id_sede = @id_sede1 AND estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_personal_credencial`
  (`id_personal`, `tipo`, `numero`, `entidad`, `estado_registro`, `id_usuario_crea`)
SELECT @id_soraya, 'CMP', '41034', 'Colegio Médico del Perú', 'ACTIVO', 1
WHERE @id_soraya IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_personal_credencial
    WHERE id_personal = @id_soraya AND tipo = 'CMP' AND numero = '41034' AND estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_personal_credencial`
  (`id_personal`, `tipo`, `numero`, `entidad`, `estado_registro`, `id_usuario_crea`)
SELECT @id_soraya, 'RNE', '19238', 'Registro Nacional de Especialistas', 'ACTIVO', 1
WHERE @id_soraya IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_personal_credencial
    WHERE id_personal = @id_soraya AND tipo = 'RNE' AND numero = '19238' AND estado_registro = 'ACTIVO'
  );
