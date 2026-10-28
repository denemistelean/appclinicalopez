# Guía corta — Planes, sesiones y pagos (Sorela)

Para el personal de recepción y administración.

## Tipos de pago

| Tipo | Cuándo usarlo |
|------|----------------|
| **Adelanto** | Pago parcial cuando el paciente **aún no ha tenido ninguna sesión**. No es obligatorio: se puede atender sin adelanto. |
| **Abono** | Pago parcial cuando **ya hubo** al menos una sesión. |
| **Liquidación** (antes “Cancelación” de pago) | Cobro del **saldo restante** del plan (monto = saldo). **No anula** el tratamiento contratado. |
| **Pago** (sin tipo) | Cobros antiguos: no se reclasifican; se muestran así. |

Si deja el tipo vacío al cobrar, el sistema elige según monto y sesiones usadas. Si el monto es exactamente el saldo, queda como liquidación.

### Dar de baja un plan contratado

En **Administrativa → Planes de tratamiento**, abra el plan vigente y use **Dar de baja** (pide motivo).

- El plan deja de estar activo: no aparece en sesiones por programar ni se pueden agendar más sesiones de ese contrato.
- Se liberan los vínculos de citas **abiertas** (pendiente/confirmada/en atención) a ese plan.
- Las sesiones **ya finalizadas** y los **pagos registrados** se conservan; el plan pasa a **Realizados / dados de baja** con estado, sesiones usadas/pendientes, motivo y fecha.
- Si hubo cobros, el sistema pide cuánto **devolver** y cuánto **retener**. La devolución queda en el historial de pagos (tipo **DEVOLUCION**) y el neto pagado del plan baja en esa cantidad. La venta del plan se anula.
- No confundir con el tipo de cobro “liquidación” (pagar el saldo): eso no da de baja el plan.

### Venta vs adelanto / abono

Al contratar o al primer cobro de un plan se crea **una sola venta** (`cli_hd_venta`). Los adelantos, abonos y liquidaciones posteriores son pagos de esa misma venta; no generan ventas nuevas.

### Pagos en Administrativa

No hay una lista global de pagos siempre visible. Haga clic en el plan (vigente o histórico) para ver sus pagos y, si está vigente, registrar un cobro.

## “Sugerida desde”

Es una **fecha orientativa** (última sesión + intervalo del catálogo, p. ej. 15 días).  
**No bloquea** la agenda: puede programar antes o después.

## Aviso de sesiones pendientes (Agenda)

Al elegir un paciente, si hay un plan con sesiones por programar verá un aviso **opcional**:

- **Ligar a esta sesión** — al guardar, la cita quedará vinculada a esa sesión del plan.
- **No ligar** — la cita se guarda **sin** vínculo al plan.
- **Quitar vínculo** — si ya eligió ligar en el formulario, puede deshacerlo antes de guardar.

Solo cuenta lo elegido al **guardar** la cita; puede alternar libremente mientras el formulario está abierto. El aviso **nunca** impide guardar.

### Después de guardar la cita ligada

Una vez creada la cita con vínculo, **editarla en Agenda** (cambiar fecha/hora = reprogramar) **conserva** el vínculo: es la misma `cli_cita`.

Para **liberar** el número de sesión del plan use **No asistió** o **Cancelar**: se soft-borra `cli_hd_cita_sesion` y puede agendar otra cita y ligarla de nuevo. Restitución/administración siguen disponibles si ya se descontó al finalizar.

Al finalizar la atención, el plan y la sesión que se descuentan son los que quedan registrados para esa cita.

El número de sesión de una cita pendiente es una referencia; el número definitivo se asigna cuando se finaliza la atención.

## Restituir sesión

Solo con permiso de administrador: si se descontó una sesión por error.  
Devuelve 1 sesión al plan; la atención clínica **no** se reabre. Solo la última sesión del plan (luego la anterior, en cadena).
