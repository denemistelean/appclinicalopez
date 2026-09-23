import{Body,Controller,Delete,Get,Param,ParseIntPipe,Patch,Post,Put,Req,UseGuards}from'@nestjs/common';
import{JwtAuthGuard,PermissionsGuard,RequirePermissions}from'@app/auth';
import{HistoriaPacienteService}from'./historia-paciente.service';
import{HistoriaItemDto,UpdateHistoriaItemDto}from'./historia-paciente.dto';
@Controller('pacientes/:id')@UseGuards(JwtAuthGuard,PermissionsGuard)
export class HistoriaPacienteController{
 constructor(private readonly service:HistoriaPacienteService){}
 @RequirePermissions('HISTORIA_PACIENTE','ver_historia_paciente')@Get('historia-resumen')resumen(@Param('id',ParseIntPipe)id:number){return this.service.resumen(id);}
 @RequirePermissions('HISTORIA_PACIENTE','ver_historia_paciente')@Get('gineco-obstetrico')gineco(@Param('id',ParseIntPipe)id:number){return this.service.getGineco(id);}
 @RequirePermissions('HISTORIA_PACIENTE','actualizar_historia_paciente')@Put('gineco-obstetrico')upsert(@Param('id',ParseIntPipe)id:number,@Body()d:HistoriaItemDto,@Req()r:any){return this.service.upsertGineco(id,d.datos,r.user.userId);}
 @RequirePermissions('HISTORIA_PACIENTE','ver_historia_paciente')@Get(':recurso')list(@Param('id',ParseIntPipe)id:number,@Param('recurso')recurso:string){return this.service.list(id,recurso);}
 @RequirePermissions('HISTORIA_PACIENTE','crear_historia_paciente')@Post(':recurso')create(@Param('id',ParseIntPipe)id:number,@Param('recurso')recurso:string,@Body()d:HistoriaItemDto,@Req()r:any){return this.service.create(id,recurso,d.datos,r.user.userId);}
 @RequirePermissions('HISTORIA_PACIENTE','actualizar_historia_paciente')@Patch(':recurso/:itemId')update(@Param('id',ParseIntPipe)id:number,@Param('recurso')recurso:string,@Param('itemId',ParseIntPipe)itemId:number,@Body()d:UpdateHistoriaItemDto,@Req()r:any){return this.service.update(id,recurso,itemId,d.datos||{},r.user.userId);}
 @RequirePermissions('HISTORIA_PACIENTE','eliminar_historia_paciente')@Delete(':recurso/:itemId')remove(@Param('id',ParseIntPipe)id:number,@Param('recurso')recurso:string,@Param('itemId',ParseIntPipe)itemId:number,@Req()r:any){return this.service.remove(id,recurso,itemId,r.user.userId);}
}
