-- PATCH 028 — Libre disposición por sede (permite citas solapadas)
USE app_clinica_lopez;

ALTER TABLE `cli_sede`
  ADD COLUMN IF NOT EXISTS `libre_disposicion` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=permite citas a la misma hora (solape)' AFTER `estado`;

-- Clínica Estética López: permite solape
UPDATE `cli_sede`
SET `libre_disposicion` = 1
WHERE estado_registro = 'ACTIVO'
  AND (
    UPPER(TRIM(nombre)) LIKE '%CLINICA ESTETICA LOPEZ%'
    OR UPPER(TRIM(nombre)) LIKE '%CLÍNICA ESTÉTICA LÓPEZ%'
    OR UPPER(TRIM(nombre)) LIKE '%ESTETICA LOPEZ%'
  );

-- Sorela Medic: no permite solape
UPDATE `cli_sede`
SET `libre_disposicion` = 0
WHERE estado_registro = 'ACTIVO'
  AND UPPER(TRIM(nombre)) LIKE '%SORELA%';
