import { Module } from '@nestjs/common';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';
import { PortalProveedorModule } from '../portal-proveedor/portal-proveedor.module';

@Module({
  imports: [PortalProveedorModule],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
})
export class ProveedoresModule {}
