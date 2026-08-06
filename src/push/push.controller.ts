import { Body, Controller, Delete, Post } from '@nestjs/common';
import { CurrentUser, TenantId } from '../common/decorators/tenant.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';

// Sin @Permiso(...) de módulo — cualquier usuario autenticado gestiona su
// propia suscripción de push. El cron que envía las notificaciones sí
// respeta el permiso 'alertas' al elegir a quién notificar.
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  subscribe(
    @TenantId() empresaId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: SubscribePushDto,
  ) {
    return this.pushService.subscribe(empresaId, user.sub, dto);
  }

  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: { sub: string }, @Body() dto: UnsubscribePushDto) {
    return this.pushService.unsubscribe(user.sub, dto.endpoint);
  }
}
