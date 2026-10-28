-- El servicio o paquete elegido en la atención, y la cita de cada sesión.

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_hd_atencion' AND COLUMN_NAME = 'id_item'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_hd_atencion ADD COLUMN id_item INT NULL AFTER id_hd_componente',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `cli_hd_cita_sesion` (
  `id_cita_sesion` INT NOT NULL AUTO_INCREMENT,
  `id_cita` INT NOT NULL,
  `id_historia_digital` INT NOT NULL,
  `id_item` INT NOT NULL,
  `id_hd_paquete` INT NULL,
  `numero_sesion` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  PRIMARY KEY (`id_cita_sesion`),
  UNIQUE KEY `uk_hd_cita_sesion` (`id_cita`),
  KEY `idx_hd_cita_sesion_item` (`id_historia_digital`, `id_item`),
  CONSTRAINT `fk_hd_cita_sesion_cita` FOREIGN KEY (`id_cita`) REFERENCES `cli_cita` (`id_cita`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_cita_sesion_historia` FOREIGN KEY (`id_historia_digital`) REFERENCES `cli_historia_digital` (`id_historia_digital`) ON DELETE RESTRICT,
  CONSTRAINT `fk_hd_cita_sesion_item` FOREIGN KEY (`id_item`) REFERENCES `cli_catalogo_item` (`id_item`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Número de sesión de una cita de Sorela';
