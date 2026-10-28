-- PATCH 044 — Nro. WhatsApp del paciente + plantillas recordatorio (López y Sorela)
-- Idempotente.

-- ---------- Paciente: teléfono WhatsApp ----------
SET @col_wa := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente' AND COLUMN_NAME = 'telefono_whatsapp'
);
SET @sql_wa := IF(@col_wa = 0,
  'ALTER TABLE cli_paciente ADD COLUMN telefono_whatsapp VARCHAR(40) NULL AFTER telefono_alterno',
  'SELECT 1');
PREPARE stmt FROM @sql_wa; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Relleno inicial: si no hay WA, copiar teléfono principal (solo vacíos)
UPDATE cli_paciente
SET telefono_whatsapp = telefono
WHERE estado_registro = 'ACTIVO'
  AND (telefono_whatsapp IS NULL OR telefono_whatsapp = '')
  AND telefono IS NOT NULL AND telefono <> '';

-- ---------- Plantillas mejoradas (ambas unidades) ----------
-- Placeholders: {{saludo}} {{nombre}} {{paciente}} {{fecha}} {{hora}} {{sede}} {{tratamiento}} {{personal}} {{clinica}}

INSERT INTO `cli_plantilla_mensaje` (`id_unidad`, `codigo`, `nombre`, `canal`, `cuerpo`, `activo`)
SELECT u.id_unidad, 'CITA_RECORDATORIO', 'Recordatorio de cita', 'WHATSAPP',
       '{{saludo}} {{nombre}}, le recordamos su cita del día {{fecha}} a las {{hora}} ({{tratamiento}}). Favor de llegar 10 minutos antes. ¡Le esperamos en {{clinica}}!', 1
FROM `cli_unidad` u
WHERE u.codigo IN ('SORELA', 'LOPEZ') AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_plantilla_mensaje` p
    WHERE p.id_unidad = u.id_unidad AND p.codigo = 'CITA_RECORDATORIO' AND p.estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_plantilla_mensaje` (`id_unidad`, `codigo`, `nombre`, `canal`, `cuerpo`, `activo`)
SELECT u.id_unidad, 'CITA_CONFIRMAR', 'Confirmar asistencia', 'WHATSAPP',
       '{{saludo}} {{nombre}}, ¿nos confirma su asistencia a la cita del {{fecha}} a las {{hora}} ({{tratamiento}} en {{clinica}})? Responda SI o NO, por favor.', 1
FROM `cli_unidad` u
WHERE u.codigo IN ('SORELA', 'LOPEZ') AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_plantilla_mensaje` p
    WHERE p.id_unidad = u.id_unidad AND p.codigo = 'CITA_CONFIRMAR' AND p.estado_registro = 'ACTIVO'
  );

INSERT INTO `cli_plantilla_mensaje` (`id_unidad`, `codigo`, `nombre`, `canal`, `cuerpo`, `activo`)
SELECT u.id_unidad, 'CITA_HOY_LLEGADA', 'Cita hoy — llegar temprano', 'WHATSAPP',
       '{{saludo}} {{nombre}}, hoy {{fecha}} a las {{hora}} tiene su cita ({{tratamiento}}). Favor de llegar 10 minutos antes. {{clinica}}.', 1
FROM `cli_unidad` u
WHERE u.codigo IN ('SORELA', 'LOPEZ') AND u.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM `cli_plantilla_mensaje` p
    WHERE p.id_unidad = u.id_unidad AND p.codigo = 'CITA_HOY_LLEGADA' AND p.estado_registro = 'ACTIVO'
  );

-- Actualiza textos antiguos de Sorela (si existen)
UPDATE cli_plantilla_mensaje p
JOIN cli_unidad u ON u.id_unidad = p.id_unidad AND u.codigo = 'SORELA'
SET p.cuerpo = '{{saludo}} {{nombre}}, le recordamos su cita en {{clinica}} el {{fecha}} a las {{hora}} ({{tratamiento}}). Favor de llegar 10 minutos antes. ¡Le esperamos!'
WHERE p.codigo = 'CITA_MANANA' AND p.estado_registro = 'ACTIVO';

UPDATE cli_plantilla_mensaje p
JOIN cli_unidad u ON u.id_unidad = p.id_unidad AND u.codigo = 'SORELA'
SET p.cuerpo = '{{saludo}} {{nombre}}, hoy {{fecha}} a las {{hora}} tiene su cita en {{clinica}} ({{tratamiento}} con {{personal}}). Favor de llegar 10 minutos antes y confirme su asistencia.'
WHERE p.codigo = 'CITA_HOY' AND p.estado_registro = 'ACTIVO';
