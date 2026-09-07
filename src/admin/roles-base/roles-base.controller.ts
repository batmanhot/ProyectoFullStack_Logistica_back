import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { RolesBaseService } from './roles-base.service';
import { CreateAdminRolDto } from './dto/create-admin-rol.dto';
import { UpdateAdminRolDto } from './dto/update-admin-rol.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@UseInterceptors(PlatformAuditInterceptor)
@Controller('admin/roles-base')
export class RolesBaseController {
  constructor(private readonly rolesBaseService: RolesBaseService) {}

  @Get()
  findAll() {
    return this.rolesBaseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesBaseService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAdminRolDto) {
    return this.rolesBaseService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdminRolDto) {
    return this.rolesBaseService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesBaseService.remove(id);
  }
}
