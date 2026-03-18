import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: true,
        credentials: true,
    },
    path: '/socket.io',
})
export class LeaderboardGateway {
    @WebSocketServer()
    server!: Server;

    broadcastUpdate(reason: string = 'update') {
        this.server.emit('leaderboard:updated', {
            reason,
            at: new Date().toISOString(),
        });
    }
}
