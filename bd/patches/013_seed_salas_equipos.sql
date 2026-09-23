-- ==============================================================================
-- PATCH 013 — Datos de prueba: tipos equipo, salas y equipos (Sede Central)
-- ==============================================================================
USE app_clinica_lopez;

-- Tipos de equipo
INSERT INTO `cli_tipo_equipo` (`nombre`, `descripcion`, `estado_registro`)
SELECT v.nombre, v.descripcion, 'ACTIVO' FROM (
  SELECT 'Láser Diodo' AS nombre, 'Equipo de depilación láser diodo' AS descripcion UNION ALL
  SELECT 'Radiofrecuencia', 'Equipo de radiofrecuencia facial/corporal' UNION ALL
  SELECT 'Ultrasonido', 'Equipo de ultrasonido estético' UNION ALL
  SELECT 'Luz pulsada (IPL)', 'Equipo IPL multipropósito'
) v
WHERE NOT EXISTS (
  SELECT 1 FROM cli_tipo_equipo t WHERE t.nombre = v.nombre AND t.estado_registro = 'ACTIVO'
);

SET @id_sede := (SELECT id_sede FROM cli_sede WHERE estado_registro = 'ACTIVO' ORDER BY id_sede LIMIT 1);

-- Si no hay sede, no insertar salas/equipos
-- Salas
INSERT INTO `cli_sala` (`id_sede`, `nombre`, `capacidad_equipo`, `estado`, `estado_registro`, `id_usuario_crea`)
SELECT @id_sede, v.nombre, v.cap, 'DISPONIBLE', 'ACTIVO', 1 FROM (
  SELECT 'Sala 1' AS nombre, 'equipo láser fijo' AS cap UNION ALL
  SELECT 'Sala 2', 'uso general' UNION ALL
  SELECT 'Sala 3', 'cirugía menor / procedimiento' UNION ALL
  SELECT 'Consultorio A', 'evaluación / cita simple' UNION ALL
  SELECT 'Consultorio B', 'evaluación / cita simple'
) v
WHERE @id_sede IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_sala s
    WHERE s.id_sede = @id_sede AND s.nombre = v.nombre AND s.estado_registro = 'ACTIVO'
  );

SET @tipo_laser := (SELECT id_tipo_equipo FROM cli_tipo_equipo WHERE nombre = 'Láser Diodo' AND estado_registro = 'ACTIVO' LIMIT 1);
SET @tipo_rf := (SELECT id_tipo_equipo FROM cli_tipo_equipo WHERE nombre = 'Radiofrecuencia' AND estado_registro = 'ACTIVO' LIMIT 1);
SET @tipo_us := (SELECT id_tipo_equipo FROM cli_tipo_equipo WHERE nombre = 'Ultrasonido' AND estado_registro = 'ACTIVO' LIMIT 1);
SET @tipo_ipl := (SELECT id_tipo_equipo FROM cli_tipo_equipo WHERE nombre = 'Luz pulsada (IPL)' AND estado_registro = 'ACTIVO' LIMIT 1);

INSERT INTO `cli_equipo`
  (`id_sede`, `id_tipo_equipo`, `nombre`, `tipo`, `numero_serie`, `fecha_adquisicion`, `fecha_ultimo_mantenimiento`, `proximo_mantenimiento`, `estado`, `estado_registro`, `id_usuario_crea`)
SELECT @id_sede, v.id_tipo, v.nombre, v.tipo, v.serie, v.adq, v.ult, v.prox, 'OPERATIVO', 'ACTIVO', 1
FROM (
  SELECT @tipo_laser AS id_tipo, 'Láser Diodo Principal' AS nombre, 'Láser Diodo' AS tipo, 'LD-2024-001' AS serie,
         '2024-03-15' AS adq, '2026-06-01' AS ult, '2026-12-01' AS prox UNION ALL
  SELECT @tipo_rf, 'Radiofrecuencia Facial', 'Radiofrecuencia', 'RF-2023-014', '2023-11-20', '2026-05-10', '2026-11-10' UNION ALL
  SELECT @tipo_us, 'Ultrasonido Estético', 'Ultrasonido', 'US-2025-003', '2025-01-08', '2026-07-01', '2027-01-01' UNION ALL
  SELECT @tipo_ipl, 'IPL Multipropósito', 'Luz pulsada (IPL)', 'IPL-2024-007', '2024-08-01', '2026-04-15', '2026-10-15'
) v
WHERE @id_sede IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cli_equipo e
    WHERE e.id_sede = @id_sede AND e.nombre = v.nombre AND e.estado_registro = 'ACTIVO'
  );
