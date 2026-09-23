-- ==============================================================================
-- PATCH 016 — Historia clínica estructurada (anamnesis, examen, dx, plan meds)
-- ==============================================================================
USE app_clinica_lopez;

-- Columnas estructuradas en consulta
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='tiempo_enfermedad');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN tiempo_enfermedad VARCHAR(120) NULL AFTER motivo_consulta', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='tipo_enfermedad');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN tipo_enfermedad VARCHAR(80) NULL AFTER tiempo_enfermedad', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='relato');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN relato TEXT NULL AFTER tipo_enfermedad', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='apreciacion');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN apreciacion TEXT NULL AFTER examen_fisico', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='examen_json');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN examen_json JSON NULL AFTER apreciacion', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cli_consulta' AND COLUMN_NAME='adjuntos_json');
SET @sql := IF(@c=0, 'ALTER TABLE cli_consulta ADD COLUMN adjuntos_json JSON NULL AFTER examen_json', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Tipos de diagnóstico ampliados
ALTER TABLE `cli_consulta_diagnostico`
  MODIFY COLUMN `tipo` ENUM('PRESUNTIVO','DEFINITIVO','RECURRENTE','PRINCIPAL','SECUNDARIO') NOT NULL DEFAULT 'PRESUNTIVO';

-- Catálogo medicamentos (búsqueda en plan)
CREATE TABLE IF NOT EXISTS `cli_medicamento` (
  `id_medicamento` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(150) NOT NULL,
  `concentracion` VARCHAR(80) NULL,
  `forma` VARCHAR(80) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_medicamento`),
  KEY `idx_cli_med_nombre` (`nombre`)
) ENGINE=InnoDB COMMENT='Catálogo de medicamentos para plan terapéutico';

CREATE TABLE IF NOT EXISTS `cli_consulta_plan_medicamento` (
  `id_consulta_plan_medicamento` INT NOT NULL AUTO_INCREMENT,
  `id_consulta_plan` INT NOT NULL,
  `id_medicamento` INT NULL,
  `medicamento` VARCHAR(150) NOT NULL,
  `dosis` VARCHAR(80) NULL,
  `via` VARCHAR(60) NULL,
  `frecuencia` VARCHAR(80) NULL,
  `duracion` VARCHAR(80) NULL,
  `indicaciones` VARCHAR(255) NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_consulta_plan_medicamento`),
  KEY `idx_cli_plan_med_plan` (`id_consulta_plan`),
  KEY `idx_cli_plan_med_med` (`id_medicamento`),
  CONSTRAINT `fk_cli_plan_med_plan` FOREIGN KEY (`id_consulta_plan`) REFERENCES `cli_consulta_plan` (`id_consulta_plan`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_plan_med_med` FOREIGN KEY (`id_medicamento`) REFERENCES `cli_medicamento` (`id_medicamento`) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Medicamentos indicados en el plan de la consulta';

-- Seed medicamentos
INSERT INTO `cli_medicamento` (`nombre`, `concentracion`, `forma`)
SELECT v.nombre, v.concentracion, v.forma FROM (
  SELECT 'PARACETAMOL' AS nombre, '500 mg' AS concentracion, 'TABLETA' AS forma UNION ALL
  SELECT 'IBUPROFENO', '400 mg', 'TABLETA' UNION ALL
  SELECT 'AMOXICILINA', '500 mg', 'CÁPSULA' UNION ALL
  SELECT 'CEFALEXINA', '500 mg', 'CÁPSULA' UNION ALL
  SELECT 'DICLOFENACO', '50 mg', 'TABLETA' UNION ALL
  SELECT 'TRAMADOL', '50 mg', 'CÁPSULA' UNION ALL
  SELECT 'OMEPRAZOL', '20 mg', 'CÁPSULA' UNION ALL
  SELECT 'LORATADINA', '10 mg', 'TABLETA' UNION ALL
  SELECT 'PREDNISONA', '20 mg', 'TABLETA' UNION ALL
  SELECT 'CIPROFLOXACINO', '500 mg', 'TABLETA' UNION ALL
  SELECT 'METRONIDAZOL', '500 mg', 'TABLETA' UNION ALL
  SELECT 'KETOROLACO', '10 mg', 'TABLETA'
) v
WHERE NOT EXISTS (SELECT 1 FROM cli_medicamento m WHERE m.nombre = v.nombre AND m.estado_registro='ACTIVO');

-- CIE-10 estética / clínica
INSERT INTO `cli_cie10` (`codigo`, `descripcion`, `categoria`)
SELECT v.codigo, v.descripcion, v.categoria FROM (
  SELECT 'N64.89' AS codigo, 'Otros trastornos especificados de la mama (incluye ptosis mamaria)' AS descripcion, 'Mama' AS categoria UNION ALL
  SELECT 'N62', 'Hipertrofia de la mama', 'Mama' UNION ALL
  SELECT 'Q83.8', 'Otras malformaciones congénitas de la mama', 'Mama' UNION ALL
  SELECT 'L90.9', 'Trastorno atrófico de la piel, no especificado (flacidez cutánea)', 'Piel' UNION ALL
  SELECT 'L57.8', 'Otros cambios de la piel debidos a exposición crónica a radiación no ionizante', 'Piel' UNION ALL
  SELECT 'L81.9', 'Trastorno de la pigmentación, no especificado', 'Piel' UNION ALL
  SELECT 'L81.1', 'Cloasma / Melasma', 'Piel' UNION ALL
  SELECT 'E65', 'Adiposidad localizada', 'Metabolismo' UNION ALL
  SELECT 'H02.3', 'Blefarocalasia / blefaroptosis', 'Párpados' UNION ALL
  SELECT 'H02.4', 'Ptosis del párpado', 'Párpados' UNION ALL
  SELECT 'M95.0', 'Deformidad adquirida de la nariz', 'Facial' UNION ALL
  SELECT 'Z41.1', 'Consulta para procedimiento cosmético', 'Estética' UNION ALL
  SELECT 'L98.9', 'Trastorno de la piel y del tejido subcutáneo, no especificado', 'Piel' UNION ALL
  SELECT 'R52.9', 'Dolor, no especificado', 'Síntoma'
) v
WHERE NOT EXISTS (SELECT 1 FROM cli_cie10 c WHERE c.codigo = v.codigo AND c.estado_registro='ACTIVO');

-- Plantillas clínicas (autofill anamnesis)
INSERT INTO `cli_plantilla_clinica` (`nombre`, `especialidad`, `estructura_json`, `activa`)
SELECT v.nombre, v.especialidad, v.estructura_json, 1
FROM (
  SELECT 'MAMAS CAÍDAS' AS nombre, 'Estética' AS especialidad,
    JSON_OBJECT(
      'tiempo_enfermedad','1 año',
      'tipo_enfermedad','Crónico',
      'motivo','Paciente refiere caída y pérdida de volumen mamario, especialmente tras lactancia o pérdida de peso.',
      'relato','Sensación de flacidez, molestia con el uso de sujetador, asimetría percibida. Sin cirugías mamarias previas.'
    ) AS estructura_json
  UNION ALL SELECT 'FLACIDEZ FACIAL', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','2 años','tipo_enfermedad','Crónico',
      'motivo','Paciente refiere pérdida de firmeza en tercio medio e inferior del rostro.',
      'relato','Descenso del óvalo facial, surcos nasogenianos marcados, papada incipiente. Exposición solar frecuente.')
  UNION ALL SELECT 'LÍNEAS DE EXPRESIÓN', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','3 años','tipo_enfermedad','Crónico',
      'motivo','Paciente consulta por líneas de expresión en frente, glabela y periocular.',
      'relato','Sin procedimientos estéticos previos con toxina. Desea rejuvenecimiento no quirúrgico.')
  UNION ALL SELECT 'LIPODISTROFIA CORPORAL', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','3 años','tipo_enfermedad','Crónico',
      'motivo','Paciente refiere acúmulo de grasa localizada resistente a dieta y ejercicio.',
      'relato','Molestia estética en abdomen/flancos. Actividad física regular. Sin comorbilidades reportadas.')
  UNION ALL SELECT 'POBLEFARO', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','2 años','tipo_enfermedad','Crónico',
      'motivo','Paciente refiere exceso de piel en párpados superiores y/o bolsas inferiores.',
      'relato','Sensación de mirada cansada. Sin cirugía palpebral previa.')
  UNION ALL SELECT 'MAMAS GRANDES', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','5 años','tipo_enfermedad','Crónico',
      'motivo','Paciente consulta por hipertrofia mamaria con molestias funcionales y estéticas.',
      'relato','Dolor cervical/dorsal asociado, marcas de sujetador, dificultad para actividad física.')
  UNION ALL SELECT 'MAMAS PEQUEÑAS', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','años','tipo_enfermedad','Constitucional',
      'motivo','Paciente desea aumento de volumen mamario por hipoplasia / asimetría.',
      'relato','Sin lactancia reciente. Expectativa de mejora de contorno y proporción corporal.')
  UNION ALL SELECT 'BLEFAROPLASTIA', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','2 años','tipo_enfermedad','Crónico',
      'motivo','Evaluación para blefaroplastia por dermatochalasis / bolsas palpebrales.',
      'relato','Paciente refiere aspecto de fatiga y, en algunos casos, limitación del campo visual superior.')
  UNION ALL SELECT 'MIRADA TRISTE', 'Estética',
    JSON_OBJECT('tiempo_enfermedad','1 año','tipo_enfermedad','Crónico',
      'motivo','Paciente refiere aspecto de mirada triste o cansada en reposo.',
      'relato','Descenso de cola de ceja y/o exceso palpebral. Desea armonización de mirada.')
) v
WHERE NOT EXISTS (
  SELECT 1 FROM cli_plantilla_clinica p WHERE p.nombre = v.nombre AND p.estado_registro='ACTIVO'
);
