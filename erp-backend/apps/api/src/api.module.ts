import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from '@app/database';
import { SecurityModule } from '@app/security';
import { AuditoriaModule } from '@app/common';
import { AuthModule as SharedAuthModule } from '@app/auth';

import { ApiController } from './api.controller';
import { ApiService } from './api.service';

// --- Modulos Core ---
import { SeguridadModule } from './core/seguridad/seguridad.module';
import { UsuariosModule } from './core/usuarios/usuarios.module';
import { MailModule } from './core/mail/mail.module';
import { AuthModule as LocalAuthModule } from './core/auth/auth.module';

// --- Dominio clinico ---
import { DashboardModule } from './erp/dashboard/dashboard.module';
import { SedesModule } from './erp/sedes/sedes.module';
import { PersonalModule } from './erp/personal/personal.module';
import { TratamientosModule } from './erp/tratamientos/tratamientos.module';
import { InventarioModule } from './erp/inventario/inventario.module';
import { PacientesModule } from './erp/pacientes/pacientes.module';
import { HistoriaPacienteModule } from './erp/historia-paciente/historia-paciente.module';
import { AgendaModule } from './erp/agenda/agenda.module';
import { HistoriaClinicaModule } from './erp/historia-clinica/historia-clinica.module';
import { ConsentimientosModule } from './erp/consentimientos/consentimientos.module';
import { FotosEvolucionModule } from './erp/fotos-evolucion/fotos-evolucion.module';
import { FacturacionModule } from './erp/facturacion/facturacion.module';
import { NotificacionesModule } from './erp/notificaciones/notificaciones.module';
import { ReportesModule } from './erp/reportes/reportes.module';
import { DocumentosModule } from './erp/documentos/documentos.module';
import { MapaCorporalModule } from './erp/mapa-corporal/mapa-corporal.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DatabaseModule,
    SharedAuthModule,
    SecurityModule,
    AuditoriaModule,
    LocalAuthModule,
    UsuariosModule,
    SeguridadModule,
    MailModule,
    DashboardModule,
    SedesModule,
    PersonalModule,
    TratamientosModule,
    InventarioModule,
    PacientesModule,
    HistoriaPacienteModule,
    AgendaModule,
    HistoriaClinicaModule,
    ConsentimientosModule,
    FotosEvolucionModule,
    FacturacionModule,
    NotificacionesModule,
    ReportesModule,
    DocumentosModule,
    MapaCorporalModule,
  ],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
