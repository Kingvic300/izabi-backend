
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const users = await usersService.findAll();
  console.log(JSON.stringify(users.map(u => ({ id: u._id, email: u.email, streak: u.streak, lastStreakDate: u.lastStreakDate })), null, 2));
  await app.close();
}
bootstrap();
