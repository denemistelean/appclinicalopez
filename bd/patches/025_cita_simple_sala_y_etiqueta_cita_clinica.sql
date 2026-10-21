-- Cita simple puede reservar sala de uso general.
-- El módulo HISTORIA_CLINICA se muestra como «Cita clínica».
USE app_clinica_lopez;

UPDATE cli_tipo_cita
SET descripcion = 'Toma de datos y orientación. Permite reservar la sala de uso general.'
WHERE codigo = 'CITA_SIMPLE' AND estado_registro = 'ACTIVO';

UPDATE sis_modulo
SET etiqueta = 'Cita clínica'
WHERE nombre = 'HISTORIA_CLINICA' AND estado_registro = 'ACTIVO';

UPDATE sis_accion
SET descripcion = 'Ver cita clínica'
WHERE codigo_accion = 'ver_historia_clinica' AND estado_registro = 'ACTIVO';

UPDATE sis_accion
SET descripcion = 'Crear cita clínica'
WHERE codigo_accion = 'crear_historia_clinica' AND estado_registro = 'ACTIVO';

UPDATE sis_accion
SET descripcion = 'Actualizar cita clínica'
WHERE codigo_accion = 'actualizar_historia_clinica' AND estado_registro = 'ACTIVO';

UPDATE sis_accion
SET descripcion = 'Anular cita clínica'
WHERE codigo_accion = 'eliminar_historia_clinica' AND estado_registro = 'ACTIVO';
