import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Chat, ChatSchema } from './entities/chat.entity';
import { UsersModule } from '../users/users.module';
import { VectorService } from './vector.service';
import {
  KnowledgeBase,
  KnowledgeBaseSchema,
} from './entities/knowledge-base.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Chat.name, schema: ChatSchema },
      { name: KnowledgeBase.name, schema: KnowledgeBaseSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [AiController],
  providers: [AiService, VectorService],
  exports: [AiService, VectorService],
})
export class AiModule {}
