-- Procedimientos mínimos, con el mismo contrato que usa el servicio.
-- SQL SECURITY INVOKER: corren con el usuario de prueba, no como root.
-- Sin USE. Crearlas con la base aislada ya seleccionada.

DELIMITER $$

CREATE PROCEDURE sis_usuario_obtener_por_correo(IN p_credencial VARCHAR(150))
SQL SECURITY INVOKER
BEGIN
  SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.password,
         u.id_rol, r.nombre AS rol, u.estado_registro
  FROM sis_usuario u
  INNER JOIN sis_rol r ON u.id_rol = r.id_rol
  WHERE u.correo = p_credencial AND u.estado_registro = 'ACTIVO';
END$$

CREATE PROCEDURE sis_usuario_obtener(IN p_id INT)
SQL SECURITY INVOKER
BEGIN
  SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.id_rol,
         r.nombre AS rol, u.estado_registro
  FROM sis_usuario u
  INNER JOIN sis_rol r ON u.id_rol = r.id_rol
  WHERE u.id_usuario = p_id AND u.estado_registro != 'ELIMINADO';
END$$

CREATE PROCEDURE sis_usuario_eliminar(IN p_id INT)
SQL SECURITY INVOKER
BEGIN
  UPDATE sis_usuario SET estado_registro = 'ELIMINADO' WHERE id_usuario = p_id;
END$$

CREATE PROCEDURE sis_usuario_listar(IN p_id_rol INT, IN p_estado VARCHAR(20))
SQL SECURITY INVOKER
BEGIN
  SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, r.nombre AS rol, u.estado_registro
  FROM sis_usuario u
  INNER JOIN sis_rol r ON u.id_rol = r.id_rol
  WHERE (p_id_rol IS NULL OR u.id_rol = p_id_rol)
    AND (p_estado IS NULL OR u.estado_registro = p_estado)
  ORDER BY u.apellidos ASC;
END$$

CREATE PROCEDURE sis_rol_listar()
SQL SECURITY INVOKER
BEGIN
  SELECT id_rol, nombre, descripcion
  FROM sis_rol
  WHERE estado_registro = 'ACTIVO'
  ORDER BY id_rol ASC;
END$$

DELIMITER ;
