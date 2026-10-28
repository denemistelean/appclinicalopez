-- ==============================================================================
-- VARIANTE DE PRUEBA de bd/patches/034_cli_sesion.sql
-- No es el parche de la base de negocio y no debe aplicarse sobre ella.
-- No contiene USE ni ningún nombre ejecutable de la base clínica.
-- El cliente tiene que estar ya posicionado en la base aislada.
-- La reversión sigue siendo un comentario: no ejecutar DROP TABLE.
-- ==============================================================================
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_sesion` (
  `id_sesion` CHAR(36) NOT NULL COMMENT 'UUID aleatorio, distinto del id de usuario',
  `id_usuario` INT NOT NULL,
  `hash_refresh` CHAR(64) NOT NULL COMMENT 'SHA-256 hex del refresh vigente',
  `fecha_creacion` DATETIME NOT NULL,
  `vence_en` DATETIME NOT NULL COMMENT 'Vencimiento absoluto, FROM_UNIXTIME(session_exp)',
  `fecha_revocacion` DATETIME NULL,
  `motivo_revocacion` VARCHAR(40) NULL,
  `fecha_renovacion` DATETIME NULL,
  PRIMARY KEY (`id_sesion`),
  KEY `idx_cli_sesion_usuario` (`id_usuario`),
  KEY `idx_cli_sesion_vence` (`vence_en`),
  CONSTRAINT `fk_cli_sesion_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `sis_usuario` (`id_usuario`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Refresh revocable por dispositivo';

-- Reversión, en un paso aparte y solo para deshacer este parche:
-- DROP TABLE IF EXISTS `cli_sesion`;
