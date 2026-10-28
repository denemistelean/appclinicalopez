-- El pago de Sorela queda ligado al paquete contratado.
-- Si el paquete tiene un solo componente, la sesión ya descontada se cuenta ahí.

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND COLUMN_NAME = 'id_hd_paquete'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_pago ADD COLUMN id_hd_paquete INT NULL AFTER id_paciente_paquete',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_pago' AND CONSTRAINT_NAME = 'fk_cli_pago_hd_paquete'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE cli_pago ADD CONSTRAINT fk_cli_pago_hd_paquete FOREIGN KEY (id_hd_paquete) REFERENCES cli_hd_paquete (id_hd_paquete) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE cli_hd_paquete_componente c
JOIN cli_hd_paquete p ON p.id_hd_paquete = c.id_hd_paquete
JOIN (
  SELECT id_hd_paquete
  FROM cli_hd_paquete_componente
  WHERE estado_registro = 'ACTIVO'
  GROUP BY id_hd_paquete
  HAVING COUNT(*) = 1
) solo ON solo.id_hd_paquete = c.id_hd_paquete
SET c.sesiones_usadas = LEAST(c.sesiones_total, p.sesiones_usadas)
WHERE c.estado_registro = 'ACTIVO'
  AND c.sesiones_usadas < p.sesiones_usadas;

UPDATE cli_hd_sesion_movimiento m
JOIN cli_hd_paquete_componente c
  ON c.id_hd_paquete = m.id_hd_paquete AND c.estado_registro = 'ACTIVO'
JOIN (
  SELECT id_hd_paquete
  FROM cli_hd_paquete_componente
  WHERE estado_registro = 'ACTIVO'
  GROUP BY id_hd_paquete
  HAVING COUNT(*) = 1
) solo ON solo.id_hd_paquete = m.id_hd_paquete
SET m.id_hd_componente = c.id_hd_componente
WHERE m.id_hd_componente IS NULL;

UPDATE cli_pago p
JOIN cli_sede s ON s.id_sede = p.id_sede
JOIN (
  SELECT h.id_paciente, h.id_unidad, MIN(pk.id_hd_paquete) AS id_hd_paquete
  FROM cli_hd_paquete pk
  JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
  WHERE pk.estado_registro = 'ACTIVO'
  GROUP BY h.id_paciente, h.id_unidad
  HAVING COUNT(*) = 1
) u ON u.id_paciente = p.id_paciente AND u.id_unidad = COALESCE(p.id_unidad, s.id_unidad)
SET p.id_hd_paquete = u.id_hd_paquete
WHERE p.id_hd_paquete IS NULL
  AND p.estado = 'REGISTRADO'
  AND p.estado_registro = 'ACTIVO';

INSERT INTO cli_hd_cita_sesion
  (id_cita, id_historia_digital, id_item, id_hd_paquete, numero_sesion, id_usuario_crea)
SELECT a.id_cita, a.id_historia_digital, pk.id_item, pk.id_hd_paquete, 1, a.id_usuario_crea
FROM cli_hd_atencion a
JOIN cli_hd_paquete pk ON pk.id_hd_paquete = a.id_hd_paquete AND pk.estado_registro = 'ACTIVO'
WHERE a.estado = 'FINALIZADA'
  AND pk.id_item IS NOT NULL
  AND a.estado_registro = 'ACTIVO'
  AND NOT EXISTS (
    SELECT 1 FROM cli_hd_cita_sesion s
    WHERE s.id_cita = a.id_cita AND s.estado_registro = 'ACTIVO'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cli_hd_cita_sesion s
    WHERE s.id_historia_digital = a.id_historia_digital
      AND s.id_item = pk.id_item
      AND s.numero_sesion = 1
      AND s.estado_registro = 'ACTIVO'
  )
  AND (
    SELECT COUNT(*) FROM cli_hd_atencion a2
    WHERE a2.id_hd_paquete = pk.id_hd_paquete
      AND a2.estado = 'FINALIZADA'
      AND a2.estado_registro = 'ACTIVO'
  ) = 1;
