import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Health check for frontend Heartbeat to prevent 404 logs
  @Get('api')
  getApiStatus() {
    return {
      status: 'active',
      name: 'Izabi Neural API',
      timestamp: new Date().toISOString(),
    };
  }
}
