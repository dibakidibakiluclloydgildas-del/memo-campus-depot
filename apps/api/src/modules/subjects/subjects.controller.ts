import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { subjectInputSchema } from '@memo/shared';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

const updateSubjectSchema = subjectInputSchema.partial().extend({
  archived: z.boolean().optional(),
});

@ApiTags('Matières')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('includeArchived') includeArchived?: string) {
    const subjects = await this.prisma.subject.findMany({
      where: { userId: user.id, ...(includeArchived === 'true' ? {} : { archived: false }) },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { documents: true, flashcards: true, assessments: true } },
        documents: { where: { archived: false }, select: { id: true, title: true, status: true }, take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
    return subjects;
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(subjectInputSchema)) body: { name: string; color: string; level: string; code?: string },
  ) {
    return this.prisma.subject.create({
      data: { userId: user.id, name: body.name, color: body.color, level: body.level, code: body.code ?? null },
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema))
    body: { name?: string; color?: string; level?: string; code?: string; archived?: boolean },
  ) {
    await this.prisma.subject.updateMany({ where: { id, userId: user.id }, data: body });
    return this.prisma.subject.findFirstOrThrow({ where: { id, userId: user.id } });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    // Archivage logique : les cours restent liés et restaurables.
    const result = await this.prisma.subject.updateMany({
      where: { id, userId: user.id },
      data: { archived: true },
    });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: 'Matière introuvable.' });
    }
    return { success: true };
  }
}
