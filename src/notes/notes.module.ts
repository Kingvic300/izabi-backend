import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { Note, NoteSchema } from './entities/note.entity';
import {
    NoteGroup,
    NoteGroupSchema,
} from './entities/note-group.entity';
import { NoteGroupsService } from './note-groups.service';
import { NoteGroupsController } from './note-groups.controller';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Note.name, schema: NoteSchema },
            { name: NoteGroup.name, schema: NoteGroupSchema },
        ]),
    ],
    controllers: [NotesController, NoteGroupsController],
    providers: [NotesService, NoteGroupsService],
    exports: [NotesService],
})
export class NotesModule {}
