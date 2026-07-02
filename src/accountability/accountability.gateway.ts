import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: true,
        credentials: true,
    },
    path: '/socket.io',
})
export class AccountabilityGateway {
    @WebSocketServer()
    server!: Server;

    broadcast(
        partnershipId: string,
        kind: 'message' | 'nudge' | 'checkin' | 'goal' | 'partnership',
    ) {
        this.server.emit('accountability:event', {
            partnershipId,
            kind,
            at: new Date().toISOString(),
        });
    }
}
