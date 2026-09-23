-- ==============================================================================
-- PATCH 020 — CIE-10 oficial MINSA (categorías + subcategorías)
-- Fuente: cie10_categorias_subcategorias.sql (2051 + 12986)
-- Códigos MINSA sin punto (ej. A000, A0090). La tabla muestra cli_cie10 se mantiene.
-- Luego ejecutar: 020b_cli_cie10_oficial_data.sql
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cli_cie10_categoria` (
  `id_cie10_categoria` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(3) NOT NULL COMMENT 'Código categoría CIE-10 (ej. A00)',
  `nombre` VARCHAR(500) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cie10_categoria`),
  UNIQUE KEY `uk_cli_cie10_cat_codigo` (`codigo`),
  KEY `idx_cli_cie10_cat_nombre` (`nombre`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='CIE-10 MINSA: categorías (3 caracteres)';

CREATE TABLE IF NOT EXISTS `cli_cie10_subcategoria` (
  `id_cie10_subcategoria` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(6) NOT NULL COMMENT 'Código subcategoría MINSA sin punto (ej. A000, A0090)',
  `nombre` VARCHAR(500) NOT NULL,
  `codigo_categoria` VARCHAR(3) NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_cie10_subcategoria`),
  UNIQUE KEY `uk_cli_cie10_sub_codigo` (`codigo`),
  KEY `idx_cli_cie10_sub_cat` (`codigo_categoria`),
  KEY `idx_cli_cie10_sub_nombre` (`nombre`(191)),
  CONSTRAINT `fk_cli_cie10_sub_cat` FOREIGN KEY (`codigo_categoria`)
    REFERENCES `cli_cie10_categoria` (`codigo`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='CIE-10 MINSA: subcategorías (~13k códigos)';
