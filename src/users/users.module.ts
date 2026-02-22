import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { ImpersonationService } from './impersonation.service';
import { User, UserSchema } from './entities/user.entity';
import { ImpersonationAudit, ImpersonationAuditSchema } from './entities/impersonation-audit.entity';
import { AuthModule } from '../auth/auth.module';

import { NotesModule } from '../notes/notes.module';
import { QuizModule } from '../quiz/quiz.module';

import { UsersScheduler } from './users.scheduler';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: ImpersonationAudit.name, schema: ImpersonationAuditSchema },
        ]),
        forwardRef(() => AuthModule),
        forwardRef(() => NotesModule),
        forwardRef(() => QuizModule),
        JwtModule.register({}),
    ],
    controllers: [UsersController, AdminController],
    providers: [UsersService, UsersScheduler, ImpersonationService],
    exports: [UsersService, ImpersonationService, MongooseModule, JwtModule],
})
export class UsersModule {}
