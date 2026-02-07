import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { User, UserSchema } from './entities/user.entity';
import { AuthModule } from '../auth/auth.module';

import { NotesModule } from '../notes/notes.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => AuthModule),
    NotesModule,
  ],
  controllers: [UsersController, AdminController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
