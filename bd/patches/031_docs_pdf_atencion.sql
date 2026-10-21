-- ==============================================================================
-- PATCH 031 — Tipos de documento para PDFs de atención (Anamnesis/EF/Dx/Plan)
-- ==============================================================================
USE app_clinica_lopez;

INSERT INTO cli_tipo_documento (codigo, nombre, descripcion, extensiones, activo, estado_registro)
SELECT v.codigo, v.nombre, v.descripcion, 'pdf', 1, 'ACTIVO'
FROM (
  SELECT 'HC_ANAMNESIS' AS codigo, 'Anamnesis (PDF)' AS nombre,
         'PDF generado al finalizar la atención' AS descripcion
  UNION ALL SELECT 'HC_EXAMEN_FISICO', 'Examen físico (PDF)', 'PDF de examen físico de la atención'
  UNION ALL SELECT 'HC_DIAGNOSTICO', 'Diagnóstico (PDF)', 'PDF de diagnósticos de la atención'
  UNION ALL SELECT 'HC_PLAN', 'Plan terapéutico (PDF)', 'PDF del plan de la atención'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM cli_tipo_documento t WHERE t.codigo = v.codigo AND t.estado_registro = 'ACTIVO'
);
