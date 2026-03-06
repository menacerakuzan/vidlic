import { Controller, MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from './notifications.service';

@ApiExcludeController()
@Controller('notifications')
export class NotificationsStreamController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cleanup: (() => void) | null = null;
      let heartbeat: NodeJS.Timeout | null = null;

      const init = async () => {
        const rawToken = (token || '').trim();
        if (!rawToken) {
          subscriber.error(new UnauthorizedException('Token is required'));
          return;
        }

        const validated = await this.authService.validateAccessToken(rawToken);
        if (!validated?.user?.id) {
          subscriber.error(new UnauthorizedException('Invalid token'));
          return;
        }

        cleanup = this.notificationsService.subscribe(validated.user.id, (payload) => {
          subscriber.next({ data: payload });
        });
        await this.notificationsService.emitUnreadCount(validated.user.id);

        heartbeat = setInterval(() => {
          subscriber.next({ data: { type: 'ping', ts: new Date().toISOString() } });
        }, 25000);
      };

      init().catch((error) => subscriber.error(error));

      return () => {
        if (cleanup) cleanup();
        if (heartbeat) clearInterval(heartbeat);
      };
    });
  }
}
