-- ==============================================================================
-- PATCH — Restaurar procedimientos almacenados del núcleo sis_*
-- (necesarios para login y seguridad; si faltan → 500 en /auth/login)
-- ==============================================================================
USE app_clinica_lopez;

DELIMITER //

DROP PROCEDURE IF EXISTS sis_usuario_crear//
CREATE PROCEDURE sis_usuario_crear(
    IN p_id_rol INT, IN p_id_cliente INT, IN p_nombres VARCHAR(100),
    IN p_apellidos VARCHAR(100), IN p_correo VARCHAR(150), IN p_password VARCHAR(255)
)
BEGIN
    INSERT INTO sis_usuario (id_rol, nombres, apellidos, correo, password)
    VALUES (p_id_rol, p_nombres, p_apellidos, p_correo, p_password);
    SELECT LAST_INSERT_ID() AS id_insertado;
END//

DROP PROCEDURE IF EXISTS sis_usuario_actualizar//
CREATE PROCEDURE sis_usuario_actualizar(
    IN p_id INT, IN p_id_rol INT, IN p_nombres VARCHAR(100),
    IN p_apellidos VARCHAR(100), IN p_correo VARCHAR(150)
)
BEGIN
    UPDATE sis_usuario SET id_rol = p_id_rol, nombres = p_nombres, apellidos = p_apellidos, correo = p_correo
    WHERE id_usuario = p_id;
END//

DROP PROCEDURE IF EXISTS sis_usuario_eliminar//
CREATE PROCEDURE sis_usuario_eliminar(IN p_id INT)
BEGIN
    UPDATE sis_usuario SET estado_registro = 'ELIMINADO' WHERE id_usuario = p_id;
END//

DROP PROCEDURE IF EXISTS sis_usuario_listar//
CREATE PROCEDURE sis_usuario_listar(IN p_id_rol INT, IN p_estado VARCHAR(20))
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE (p_id_rol IS NULL OR u.id_rol = p_id_rol)
      AND (p_estado IS NULL OR u.estado_registro = p_estado)
    ORDER BY u.apellidos ASC;
END//

DROP PROCEDURE IF EXISTS sis_usuario_obtener//
CREATE PROCEDURE sis_usuario_obtener(IN p_id INT)
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.id_rol, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE u.id_usuario = p_id AND u.estado_registro != 'ELIMINADO';
END//

DROP PROCEDURE IF EXISTS sis_usuario_obtener_por_correo//
CREATE PROCEDURE sis_usuario_obtener_por_correo(IN p_credencial VARCHAR(150))
BEGIN
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.password,
           u.id_rol, r.nombre AS rol, u.estado_registro
    FROM sis_usuario u
    INNER JOIN sis_rol r ON u.id_rol = r.id_rol
    WHERE u.correo = p_credencial AND u.estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_auditoria_registrar//
CREATE PROCEDURE sis_auditoria_registrar(
    IN p_tabla VARCHAR(100), IN p_id_registro INT, IN p_accion VARCHAR(20),
    IN p_id_usuario INT, IN p_valores_antiguos JSON, IN p_valores_nuevos JSON
)
BEGIN
    INSERT INTO sis_auditoria (nombre_tabla, id_registro, accion, id_usuario, valores_antiguos, valores_nuevos)
    VALUES (p_tabla, p_id_registro, p_accion, p_id_usuario, p_valores_antiguos, p_valores_nuevos);
END//

DROP PROCEDURE IF EXISTS sis_rol_listar//
CREATE PROCEDURE sis_rol_listar()
BEGIN
    SELECT id_rol, nombre, descripcion FROM sis_rol WHERE estado_registro = 'ACTIVO' ORDER BY id_rol ASC;
END//

DROP PROCEDURE IF EXISTS sis_rol_crear//
CREATE PROCEDURE sis_rol_crear(IN p_nombre VARCHAR(50), IN p_descripcion TEXT)
BEGIN
    INSERT INTO sis_rol (nombre, descripcion, estado_registro) VALUES (p_nombre, p_descripcion, 'ACTIVO');
    SELECT LAST_INSERT_ID() AS id_insertado;
END//

DROP PROCEDURE IF EXISTS sis_rol_actualizar//
CREATE PROCEDURE sis_rol_actualizar(IN p_id INT, IN p_nombre VARCHAR(50), IN p_descripcion TEXT)
BEGIN
    UPDATE sis_rol SET nombre = p_nombre, descripcion = p_descripcion WHERE id_rol = p_id;
END//

DROP PROCEDURE IF EXISTS sis_rol_eliminar//
CREATE PROCEDURE sis_rol_eliminar(IN p_id INT)
BEGIN
    DECLARE v_total INT;
    SELECT COUNT(*) INTO v_total FROM sis_usuario WHERE id_rol = p_id AND estado_registro = 'ACTIVO';
    IF v_total > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede eliminar el rol porque tiene usuarios activos asignados.';
    END IF;
    UPDATE sis_rol SET estado_registro = 'ELIMINADO' WHERE id_rol = p_id;
END//

DROP PROCEDURE IF EXISTS sis_matriz_modulos_listar//
CREATE PROCEDURE sis_matriz_modulos_listar()
BEGIN
    SELECT m.id_modulo, m.nombre AS etiqueta, a.id_accion, a.codigo_accion AS codigo, a.descripcion
    FROM sis_modulo m LEFT JOIN sis_accion a ON m.id_modulo = a.id_modulo
    WHERE m.estado_registro = 'ACTIVO' ORDER BY m.id_modulo ASC, a.id_accion ASC;
END//

DROP PROCEDURE IF EXISTS sis_permiso_obtener_por_rol//
CREATE PROCEDURE sis_permiso_obtener_por_rol(IN p_id_rol INT)
BEGIN
    SELECT a.codigo_accion AS codigo FROM sis_permiso p INNER JOIN sis_accion a ON p.id_accion = a.id_accion
    WHERE p.id_rol = p_id_rol AND p.estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_permiso_ids_por_rol//
CREATE PROCEDURE sis_permiso_ids_por_rol(IN p_id_rol INT)
BEGIN
    SELECT id_accion FROM sis_permiso WHERE id_rol = p_id_rol AND estado_registro = 'ACTIVO';
END//

DROP PROCEDURE IF EXISTS sis_permiso_limpiar_rol//
CREATE PROCEDURE sis_permiso_limpiar_rol(IN p_id_rol INT)
BEGIN
    DELETE FROM sis_permiso WHERE id_rol = p_id_rol;
END//

DROP PROCEDURE IF EXISTS sis_permiso_asignar//
CREATE PROCEDURE sis_permiso_asignar(IN p_id_rol INT, IN p_id_accion INT)
BEGIN
    INSERT IGNORE INTO sis_permiso (id_rol, id_accion) VALUES (p_id_rol, p_id_accion);
END//

DELIMITER ;
