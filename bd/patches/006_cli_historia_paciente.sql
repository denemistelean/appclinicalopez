-- ==============================================================================
-- PATCH 006 — Historia del paciente (subtablas) + permisos HISTORIA_PACIENTE
-- Series temporales: append (no overwrite) en medidas / vitales
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_paciente_medida` (
  `id_paciente_medida` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `fecha_medida` DATETIME NOT NULL,
  `peso_kg` DECIMAL(6,2) NULL,
  `talla_cm` DECIMAL(6,2) NULL,
  `imc` DECIMAL(5,2) NULL,
  `circunferencia_cintura` DECIMAL(6,2) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_medida`),
  KEY `idx_cli_medida_pac_fecha` (`id_paciente`, `fecha_medida`),
  CONSTRAINT `fk_cli_medida_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Medidas antropométricas (append)';

CREATE TABLE IF NOT EXISTS `cli_paciente_funcion_vital` (
  `id_paciente_funcion_vital` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `fecha_registro` DATETIME NOT NULL,
  `presion_sistolica` INT NULL,
  `presion_diastolica` INT NULL,
  `frecuencia_cardiaca` INT NULL,
  `frecuencia_respiratoria` INT NULL,
  `temperatura_c` DECIMAL(4,1) NULL,
  `saturacion_o2` DECIMAL(5,2) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_funcion_vital`),
  KEY `idx_cli_vital_pac_fecha` (`id_paciente`, `fecha_registro`),
  CONSTRAINT `fk_cli_vital_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Funciones vitales (append)';

CREATE TABLE IF NOT EXISTS `cli_paciente_vacuna` (
  `id_paciente_vacuna` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `nombre_vacuna` VARCHAR(150) NOT NULL,
  `dosis` VARCHAR(60) NULL,
  `fecha_aplicacion` DATE NULL,
  `proxima_dosis` DATE NULL,
  `lote` VARCHAR(60) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_vacuna`),
  KEY `idx_cli_vacuna_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_vacuna_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Vacunas del paciente';

CREATE TABLE IF NOT EXISTS `cli_paciente_antecedente_patologico` (
  `id_paciente_antecedente_patologico` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `diagnostico` VARCHAR(255) NOT NULL,
  `codigo_cie10` VARCHAR(20) NULL,
  `fecha_diagnostico` DATE NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_antecedente_patologico`),
  KEY `idx_cli_ant_pat_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_ant_pat_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedentes patológicos';

CREATE TABLE IF NOT EXISTS `cli_paciente_antecedente_personal` (
  `id_paciente_antecedente_personal` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `tipo` VARCHAR(80) NOT NULL COMMENT 'HABITO, TOXICO, SOCIAL, OTRO',
  `descripcion` VARCHAR(255) NOT NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_antecedente_personal`),
  KEY `idx_cli_ant_per_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_ant_per_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedentes personales / hábitos';

CREATE TABLE IF NOT EXISTS `cli_paciente_antecedente_quirurgico` (
  `id_paciente_antecedente_quirurgico` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `procedimiento` VARCHAR(255) NOT NULL,
  `fecha_cirugia` DATE NULL,
  `institucion` VARCHAR(150) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_antecedente_quirurgico`),
  KEY `idx_cli_ant_quir_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_ant_quir_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedentes quirúrgicos';

CREATE TABLE IF NOT EXISTS `cli_paciente_antecedente_familiar` (
  `id_paciente_antecedente_familiar` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `parentesco` VARCHAR(60) NOT NULL,
  `diagnostico` VARCHAR(255) NOT NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_antecedente_familiar`),
  KEY `idx_cli_ant_fam_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_ant_fam_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedentes familiares';

CREATE TABLE IF NOT EXISTS `cli_paciente_alergia_ram` (
  `id_paciente_alergia_ram` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `sustancia` VARCHAR(150) NOT NULL,
  `tipo` ENUM('MEDICAMENTO','ALIMENTO','AMBIENTAL','OTRO') NOT NULL DEFAULT 'MEDICAMENTO',
  `reaccion` VARCHAR(255) NULL,
  `severidad` ENUM('LEVE','MODERADA','SEVERA','ANAFILAXIA') NOT NULL DEFAULT 'MODERADA',
  `activa` TINYINT(1) NOT NULL DEFAULT 1,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_alergia_ram`),
  KEY `idx_cli_alergia_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_alergia_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Alergias y reacciones adversas a medicamentos';

CREATE TABLE IF NOT EXISTS `cli_paciente_medicacion_habitual` (
  `id_paciente_medicacion_habitual` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `medicamento` VARCHAR(150) NOT NULL,
  `dosis` VARCHAR(80) NULL,
  `frecuencia` VARCHAR(80) NULL,
  `via` VARCHAR(40) NULL,
  `fecha_inicio` DATE NULL,
  `fecha_fin` DATE NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_medicacion_habitual`),
  KEY `idx_cli_medhab_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_medhab_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Medicación habitual';

CREATE TABLE IF NOT EXISTS `cli_paciente_gineco_obstetrico` (
  `id_paciente_gineco_obstetrico` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `menarquia_edad` INT NULL,
  `fur` DATE NULL COMMENT 'Fecha última regla',
  `ciclo_dias` INT NULL,
  `gestaciones` INT NULL,
  `partos` INT NULL,
  `cesareas` INT NULL,
  `abortos` INT NULL,
  `metodo_anticonceptivo` VARCHAR(100) NULL,
  `observaciones` TEXT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_gineco_obstetrico`),
  UNIQUE KEY `uk_cli_gineco_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_gineco_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Antecedente gineco-obstétrico (1:1)';

CREATE TABLE IF NOT EXISTS `cli_paciente_embarazo` (
  `id_paciente_embarazo` INT NOT NULL AUTO_INCREMENT,
  `id_paciente` INT NOT NULL,
  `fecha_inicio` DATE NULL,
  `fum` DATE NULL,
  `fpp` DATE NULL COMMENT 'Fecha probable de parto',
  `semanas_gestacion` INT NULL,
  `estado_embarazo` ENUM('EN_CURSO','CULMINADO','ABORTADO','DESCONOCIDO') NOT NULL DEFAULT 'EN_CURSO',
  `resultado` VARCHAR(120) NULL,
  `observaciones` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_paciente_embarazo`),
  KEY `idx_cli_embarazo_paciente` (`id_paciente`),
  CONSTRAINT `fk_cli_embarazo_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Registro de embarazos';

-- ---------- Permisos HISTORIA_PACIENTE ----------
INSERT INTO `sis_modulo` (`nombre`, `etiqueta`, `estado_registro`)
SELECT 'HISTORIA_PACIENTE', 'Historia del paciente', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_modulo WHERE nombre = 'HISTORIA_PACIENTE');

SET @id_mod_hp := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'HISTORIA_PACIENTE' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_hp, v.codigo, v.descripcion_txt, v.tipo, 'ACTIVO'
FROM (
  SELECT 'ver_historia_paciente' AS codigo, 'Ver historia del paciente' AS descripcion_txt, 'READ' AS tipo UNION ALL
  SELECT 'crear_historia_paciente', 'Registrar historia del paciente', 'CREATE' UNION ALL
  SELECT 'actualizar_historia_paciente', 'Actualizar historia del paciente', 'UPDATE' UNION ALL
  SELECT 'eliminar_historia_paciente', 'Eliminar ítems de historia', 'DELETE'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sis_accion a WHERE a.id_modulo = @id_mod_hp AND a.codigo_accion = v.codigo
);

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
WHERE a.id_modulo = @id_mod_hp AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
JOIN sis_accion a ON a.id_modulo = @id_mod_hp AND a.estado_registro = 'ACTIVO'
WHERE r.nombre = 'ADMIN_CLINICA';
