import{Module}from'@nestjs/common';import{HistoriaPacienteController}from'./historia-paciente.controller';import{HistoriaPacienteService}from'./historia-paciente.service';
@Module({controllers:[HistoriaPacienteController],providers:[HistoriaPacienteService],exports:[HistoriaPacienteService]})export class HistoriaPacienteModule{}
