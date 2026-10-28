-- =============================================================================
-- SOLO LECTURA — Diagnóstico cli_hd_cita_sesion vs contadores del plan
-- No modifica datos. Ejecutar manualmente tras respaldo si se desea revisar.
-- Interprete cada bloque con la nota al final de la consulta.
-- =============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------- 1) Por plan: sesiones_usadas vs vínculos FINALIZADOS vigentes ----------
-- Esperado en operación normal: usadas ≈ COUNT(vínculos FINALIZADA).
-- Si usadas > finalizadas: descuentos sin vínculo (o vínculos liberados/restituidos mal).
-- Si finalizadas > usadas: vínculos FINALIZADA de más (p. ej. restitución sin soft-delete).
SELECT
  p.id_hd_paquete,
  p.nombre,
  p.sesiones_total,
  p.sesiones_usadas AS usadas_plan,
  COALESCE(f.finalizadas_con_vinculo, 0) AS vinculos_finalizados,
  (p.sesiones_usadas - COALESCE(f.finalizadas_con_vinculo, 0)) AS delta_usadas_menos_vinculos
FROM cli_hd_paquete p
LEFT JOIN (
  SELECT s.id_hd_paquete, COUNT(*) AS finalizadas_con_vinculo
  FROM cli_hd_cita_sesion s
  JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
  WHERE s.estado_registro = 'ACTIVO'
    AND s.id_hd_paquete IS NOT NULL
    AND c.estado = 'FINALIZADA'
  GROUP BY s.id_hd_paquete
) f ON f.id_hd_paquete = p.id_hd_paquete
WHERE p.estado_registro = 'ACTIVO'
ORDER BY ABS(p.sesiones_usadas - COALESCE(f.finalizadas_con_vinculo, 0)) DESC, p.id_hd_paquete;

-- ---------- 2a) ERROR: mismo plan + mismo numero_sesion en ≥2 FINALIZADAS ----------
-- Dos (o más) citas FINALIZADAS con el mismo número definitivo en el mismo plan.
-- No debería ocurrir tras la sync al finalizar; investigar y reparar.
SELECT
  s.id_hd_paquete,
  s.numero_sesion,
  COUNT(*) AS cuantos_finalizados,
  GROUP_CONCAT(s.id_cita ORDER BY s.id_cita) AS ids_cita
FROM cli_hd_cita_sesion s
JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
WHERE s.estado_registro = 'ACTIVO'
  AND s.id_hd_paquete IS NOT NULL
  AND c.estado = 'FINALIZADA'
GROUP BY s.id_hd_paquete, s.numero_sesion
HAVING COUNT(*) > 1
ORDER BY s.id_hd_paquete, s.numero_sesion;

-- ---------- 2b) INFORMATIVO: duplicados con al menos una cita abierta ----------
-- Mismo numero_sesion en disco donde participa PENDIENTE/CONFIRMADA/EN_ATENCION.
-- Esperado tras finalizar fuera de orden: el número de las abiertas es informativo
-- (la app lo recalcula al leer con numerosEfectivosPlan); el de FINALIZADA es definitivo.
SELECT
  s.id_hd_paquete,
  s.numero_sesion,
  COUNT(*) AS cuantos,
  GROUP_CONCAT(s.id_cita ORDER BY s.id_cita) AS ids_cita,
  GROUP_CONCAT(c.estado ORDER BY s.id_cita) AS estados
FROM cli_hd_cita_sesion s
JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
WHERE s.estado_registro = 'ACTIVO'
  AND s.id_hd_paquete IS NOT NULL
  AND c.estado NOT IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')
GROUP BY s.id_hd_paquete, s.numero_sesion
HAVING COUNT(*) > 1
  AND SUM(c.estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_ATENCION')) >= 1
ORDER BY s.id_hd_paquete, s.numero_sesion;

-- ---------- 3) FINALIZADA con descuento vigente y sin vínculo ACTIVO ----------
-- Atención cerrada que descontó sesión pero cli_hd_cita_sesion no refleja el plan.
SELECT
  a.id_atencion,
  a.id_cita,
  a.id_hd_paquete,
  m.id_movimiento,
  m.tipo,
  DATE_FORMAT(m.fecha, '%Y-%m-%d %H:%i') AS fecha_mov
FROM cli_hd_atencion a
JOIN cli_hd_sesion_movimiento m ON m.id_atencion = a.id_atencion AND m.tipo = 'DESCUENTO'
LEFT JOIN cli_hd_sesion_movimiento r
  ON r.id_atencion = m.id_atencion
 AND r.id_movimiento > m.id_movimiento
 AND r.tipo = 'RESTITUCION'
LEFT JOIN cli_hd_cita_sesion s
  ON s.id_cita = a.id_cita AND s.estado_registro = 'ACTIVO'
JOIN cli_cita c ON c.id_cita = a.id_cita AND c.estado_registro = 'ACTIVO'
WHERE a.estado_registro = 'ACTIVO'
  AND a.estado = 'FINALIZADA'
  AND c.estado = 'FINALIZADA'
  AND r.id_movimiento IS NULL
  AND s.id_cita_sesion IS NULL
ORDER BY a.id_atencion DESC;

-- ---------- 4) CANCELADA / NO_ASISTIO / REPROGRAMADA con vínculo aún ACTIVO ----------
-- Informativo: el número no debería “ocupar” en pendientes (la app excluye estos estados),
-- pero el vínculo ACTIVO puede limpiarse con soft-delete si se desea higiene.
SELECT
  s.id_cita_sesion,
  s.id_cita,
  s.id_hd_paquete,
  s.numero_sesion,
  c.estado AS estado_cita,
  DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha_cita
FROM cli_hd_cita_sesion s
JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
WHERE s.estado_registro = 'ACTIVO'
  AND c.estado IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')
ORDER BY c.fecha_cita DESC, s.id_cita DESC;

-- =============================================================================
-- Cómo interpretar
-- 1) delta ≠ 0 → revisar ese plan (restituciones, finalizaciones sin sync, datos viejos).
-- 2a) ERROR → dos FINALIZADAS con el mismo numero_sesion definitivo; reparar datos.
-- 2b) INFORMATIVO → duplicado con cita abierta; esperado (número abierto = referencia;
--     la UI/API recalcula al leer). No requiere reparación salvo higiene.
-- 3) filas → candidatas a reparar creando/actualizando vínculo al plan descontado.
-- 4) filas → higiene opcional (soft-delete del vínculo); no bloquea “sesiones por programar”.
-- =============================================================================
