-- ==============================================================================
-- PATCH 018 — Corregir mojibake UTF-8 en plantillas de historia clínica
-- Ejecutar: mysql -uroot -p --default-character-set=utf8mb4 < 018_fix_utf8_plantillas_hc.sql
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

UPDATE cli_plantilla_clinica SET
  nombre = 'MAMAS CAÍDAS',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','1 año',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente refiere caída y pérdida de volumen mamario, especialmente tras lactancia o pérdida de peso.',
    'relato','Sensación de flacidez, molestia con el uso de sujetador, asimetría percibida. Sin cirugías mamarias previas.'
  )
WHERE id_plantilla_clinica = 1;

UPDATE cli_plantilla_clinica SET
  nombre = 'FLACIDEZ FACIAL',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','2 años',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente refiere pérdida de firmeza en tercio medio e inferior del rostro.',
    'relato','Descenso del óvalo facial, surcos nasogenianos marcados, papada incipiente. Exposición solar frecuente.'
  )
WHERE id_plantilla_clinica = 2;

UPDATE cli_plantilla_clinica SET
  nombre = 'LÍNEAS DE EXPRESIÓN',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','3 años',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente consulta por líneas de expresión en frente, glabela y periocular.',
    'relato','Sin procedimientos estéticos previos con toxina. Desea rejuvenecimiento no quirúrgico.'
  )
WHERE id_plantilla_clinica = 3;

UPDATE cli_plantilla_clinica SET
  nombre = 'LIPODISTROFIA CORPORAL',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','3 años',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente refiere acúmulo de grasa localizada resistente a dieta y ejercicio.',
    'relato','Molestia estética en abdomen/flancos. Actividad física regular. Sin comorbilidades reportadas.'
  )
WHERE id_plantilla_clinica = 4;

UPDATE cli_plantilla_clinica SET
  nombre = 'POBLEFARO',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','2 años',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente refiere exceso de piel en párpados superiores y/o bolsas inferiores.',
    'relato','Sensación de mirada cansada. Sin cirugía palpebral previa.'
  )
WHERE id_plantilla_clinica = 5;

UPDATE cli_plantilla_clinica SET
  nombre = 'MAMAS GRANDES',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','5 años',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente consulta por hipertrofia mamaria con molestias funcionales y estéticas.',
    'relato','Dolor cervical/dorsal asociado, marcas de sujetador, dificultad para actividad física.'
  )
WHERE id_plantilla_clinica = 6;

UPDATE cli_plantilla_clinica SET
  nombre = 'MAMAS PEQUEÑAS',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','años',
    'tipo_enfermedad','Constitucional',
    'motivo','Paciente desea aumento de volumen mamario por hipoplasia / asimetría.',
    'relato','Sin lactancia reciente. Expectativa de mejora de contorno y proporción corporal.'
  )
WHERE id_plantilla_clinica = 7;

UPDATE cli_plantilla_clinica SET
  nombre = 'BLEFAROPLASTIA',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','2 años',
    'tipo_enfermedad','Crónico',
    'motivo','Evaluación para blefaroplastia por dermatochalasis / bolsas palpebrales.',
    'relato','Paciente refiere aspecto de fatiga y, en algunos casos, limitación del campo visual superior.'
  )
WHERE id_plantilla_clinica = 8;

UPDATE cli_plantilla_clinica SET
  nombre = 'MIRADA TRISTE',
  especialidad = 'Estética',
  estructura_json = JSON_OBJECT(
    'tiempo_enfermedad','1 año',
    'tipo_enfermedad','Crónico',
    'motivo','Paciente refiere aspecto de mirada triste o cansada en reposo.',
    'relato','Descenso de cola de ceja y/o exceso palpebral. Desea armonización de mirada.'
  )
WHERE id_plantilla_clinica = 9;

-- CIE-10: corregir descripciones con acentos si quedaron corruptas
UPDATE cli_cie10 SET descripcion = 'Otros trastornos especificados de la mama (incluye ptosis mamaria)' WHERE codigo = 'N64.89';
UPDATE cli_cie10 SET descripcion = 'Otras malformaciones congénitas de la mama' WHERE codigo = 'Q83.8';
UPDATE cli_cie10 SET descripcion = 'Trastorno atrófico de la piel, no especificado (flacidez cutánea)' WHERE codigo = 'L90.9';
UPDATE cli_cie10 SET descripcion = 'Otros cambios de la piel debidos a exposición crónica a radiación no ionizante' WHERE codigo = 'L57.8';
UPDATE cli_cie10 SET descripcion = 'Trastorno de la pigmentación, no especificado' WHERE codigo = 'L81.9';
UPDATE cli_cie10 SET descripcion = 'Blefarocalasia / blefaroptosis' WHERE codigo = 'H02.3';
UPDATE cli_cie10 SET descripcion = 'Ptosis del párpado' WHERE codigo = 'H02.4';
UPDATE cli_cie10 SET descripcion = 'Deformidad adquirida de la nariz' WHERE codigo = 'M95.0';
UPDATE cli_cie10 SET descripcion = 'Consulta para procedimiento cosmético' WHERE codigo = 'Z41.1';
UPDATE cli_cie10 SET descripcion = 'Trastorno de la piel y del tejido subcutáneo, no especificado' WHERE codigo = 'L98.9';
UPDATE cli_cie10 SET descripcion = 'Dolor, no especificado' WHERE codigo = 'R52.9';

UPDATE cli_medicamento SET forma = 'CÁPSULA' WHERE nombre IN ('AMOXICILINA','CEFALEXINA','TRAMADOL','OMEPRAZOL') AND estado_registro='ACTIVO';
