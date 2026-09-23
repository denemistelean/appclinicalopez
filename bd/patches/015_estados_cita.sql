-- ==============================================================================
-- PATCH 015 — Estados de cita (PENDIENTE → EN_ATENCION → FINALIZADA / CANCELADA)
-- ==============================================================================
USE app_clinica_lopez;

-- Ampliar ENUM con valores nuevos + antiguos (migración segura)
ALTER TABLE `cli_cita`
  MODIFY COLUMN `estado` ENUM(
    'PROGRAMADA','PENDIENTE','CONFIRMADA','EN_ATENCION',
    'COMPLETADA','FINALIZADA','CANCELADA','NO_ASISTIO','REPROGRAMADA'
  ) NOT NULL DEFAULT 'PENDIENTE';

UPDATE `cli_cita` SET `estado` = 'PENDIENTE' WHERE `estado` = 'PROGRAMADA';
UPDATE `cli_cita` SET `estado` = 'FINALIZADA' WHERE `estado` = 'COMPLETADA';

-- ENUM definitivo
ALTER TABLE `cli_cita`
  MODIFY COLUMN `estado` ENUM(
    'PENDIENTE','CONFIRMADA','EN_ATENCION','FINALIZADA','CANCELADA','NO_ASISTIO','REPROGRAMADA'
  ) NOT NULL DEFAULT 'PENDIENTE';
