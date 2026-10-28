-- ==============================================================================
-- PATCH 034 — Sesiones revocables de refresh (cli_sesion)
-- Tabla aditiva. No modifica pacientes, citas, documentos ni usuarios.
-- No guarda el refresh en claro, ni contraseñas, ni el secreto JWT,
-- ni el rol de empresa.
-- No incluye USE: se crea en la base que la conexión ya tenga seleccionada.
-- El DDL es el mismo que pasó las pruebas en la base sintética aislada.
-- No ejecutar la reversión junto con este archivo.
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

-- Reversión, en un paso aparte y solo para deshacer este parche.
-- Permanece comentada: importar este archivo no debe ejecutarla.
-- DROP TABLE IF EXISTS `cli_sesion`;
