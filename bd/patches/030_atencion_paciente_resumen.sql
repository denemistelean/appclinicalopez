-- ==============================================================================
-- PATCH 030 — Atención paciente / Resumen clínico
-- Reutiliza cli_paciente_*; solo agrega oftalmología, notas y campos UI
-- NO toca cli_cita / cli_consulta
-- ==============================================================================
USE app_clinica_lopez;

-- ---------- Extensiones en tablas existentes ----------
ALTER TABLE cli_paciente_antecedente_patologico
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Paciente no seguro de la información' AFTER observaciones;

ALTER TABLE cli_paciente_alergia_ram
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

ALTER TABLE cli_paciente_antecedente_familiar
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

ALTER TABLE cli_paciente_medicacion_habitual
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

ALTER TABLE cli_paciente_antecedente_personal
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

ALTER TABLE cli_paciente_antecedente_quirurgico
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

ALTER TABLE cli_paciente_embarazo
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones,
  ADD COLUMN IF NOT EXISTS dato_embarazo VARCHAR(120) NULL
    COMMENT 'Etiqueta/datos embarazo actual' AFTER estado_embarazo,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE NULL AFTER fecha_inicio,
  ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150) NULL AFTER fecha_nacimiento,
  ADD COLUMN IF NOT EXISTS peso_al_nacer VARCHAR(40) NULL AFTER lugar_nacimiento,
  ADD COLUMN IF NOT EXISTS edad_gestacional_nacer VARCHAR(40) NULL AFTER peso_al_nacer;

-- Menarquia como texto libre (UI)
ALTER TABLE cli_paciente_gineco_obstetrico
  MODIFY COLUMN menarquia_edad VARCHAR(40) NULL;

ALTER TABLE cli_paciente_gineco_obstetrico
  ADD COLUMN IF NOT EXISTS regimen_catamenial VARCHAR(120) NULL AFTER menarquia_edad,
  ADD COLUMN IF NOT EXISTS inicio_relaciones_sexuales VARCHAR(80) NULL AFTER regimen_catamenial,
  ADD COLUMN IF NOT EXISTS num_parejas_sexuales VARCHAR(40) NULL AFTER inicio_relaciones_sexuales,
  ADD COLUMN IF NOT EXISTS fecha_ultimo_pap DATE NULL AFTER fur,
  ADD COLUMN IF NOT EXISTS informacion_dudosa TINYINT(1) NOT NULL DEFAULT 0 AFTER observaciones;

-- ---------- Nuevas tablas ----------
CREATE TABLE IF NOT EXISTS `cli_paciente_antecedente_oftalmologico` (
  `id_paciente_antecedente_oftalmologico` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `nombre` VARCHAR(255) NOT NULL,
  `comentario` TEXT NULL,
  `informacion_dudosa` TINYINT(1) NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_antecedente_oftalmologico`),
  KEY `idx_cli_ant_oft_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_ant_oft_paciente` FOREIGN KEY (`id_paciente`)
    REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedentes oftalmológicos';

CREATE TABLE IF NOT EXISTS `cli_paciente_nota_adicional` (
  `id_paciente_nota_adicional` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `contenido` TEXT NOT NULL,
  `fecha_nota` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_nota_adicional`),
  KEY `idx_cli_nota_pac_fecha` (`id_paciente`, `fecha_nota`),
  CONSTRAINT `fk_cli_nota_paciente` FOREIGN KEY (`id_paciente`)
    REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Notas adicionales del resumen clínico';

CREATE TABLE IF NOT EXISTS `cli_paciente_seccion_meta` (
  `id_paciente_seccion_meta` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `seccion` VARCHAR(60) NOT NULL
    COMMENT 'alergias, oftalmologicos, familiares, etc.',
  `no_refiere` TINYINT(1) NOT NULL DEFAULT 0,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_seccion_meta`),
  UNIQUE KEY `uk_cli_sec_meta` (`id_paciente`, `seccion`),
  CONSTRAINT `fk_cli_sec_meta_paciente` FOREIGN KEY (`id_paciente`)
    REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Flags por sección del resumen (ej. No refiere)';
