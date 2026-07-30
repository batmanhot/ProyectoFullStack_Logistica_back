import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlanesService } from './planes.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Public()
@UseGuards(PlatformAdminGuard)
@Controller('admin/planes')
export class PlanesController {
  constructor(private readonly planesService: PlanesService) {}

  @Get()
  findAll(@Query('incluirInactivos') incluirInactivos?: string) {
    return this.planesService.findAll(incluirInactivos === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.planesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.planesService.remove(id);
  }
}
