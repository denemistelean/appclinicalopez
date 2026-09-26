-- ==============================================================================
-- PATCH 024 — Coords 2D del marcador corporal (informe PDF)
-- Vista frontal/posterior + posición porcentual sobre silueta 2D.
-- Compatible con registros antiguos (columnas NULL → el informe hace fallback 3D).
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- MariaDB 10.4+: IF NOT EXISTS evita error si ya se aplicó
ALTER TABLE `cli_mapa_marcador`
  ADD COLUMN IF NOT EXISTS `vista_2d` ENUM('front','back') NULL
    COMMENT 'Vista 2D para informe: frontal o posterior' AFTER `pos_z`,
  ADD COLUMN IF NOT EXISTS `pos_2d_x` DECIMAL(8,4) NULL
    COMMENT 'Posicion horizontal % (0-100) en silueta 2D' AFTER `vista_2d`,
  ADD COLUMN IF NOT EXISTS `pos_2d_y` DECIMAL(8,4) NULL
    COMMENT 'Posicion vertical % (0-100) en silueta 2D' AFTER `pos_2d_x`;
