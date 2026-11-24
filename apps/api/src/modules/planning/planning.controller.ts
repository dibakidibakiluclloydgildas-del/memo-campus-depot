import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { generatePlanning, planningBlockSchema, type SchedulingTask } from '@memo/shared';
import { CurrentUser } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

const availabilityInput = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      }),
    )
    .max(40),
});

const autoPlanInput = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  sessionMinutes: z.coerce.number().int().min(15).max(120).default(45),
  breakMinutes: z.coerce.number().int().min(3).max(30).default(10),
  maxSessionsPerDay: z.coerce.number().int().min(1).max(8).default(3),
  save: z.boolean().default(true),
});

const sessionInput = z.object({
  subjectId: z.string().uuid().nullish(),
  focusMinutes: z.number().int().min(5).max(120).default(25),
  breakMinutes: z.number().int().min(3).max(30).default(5),
  cycles: z.number().int().min(1).max(8).default(4),
});

@ApiTags('Planning et organisation')
@Controller('planning')
export class PlanningController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Agenda : blocs entre deux dates (jour, semaine, mois)' })
  async agenda(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('view') view?: 'day' | 'week' | 'month',
  ) {
    const now = new Date();
    const start = from ? new Date(from) : new Date(now.getTime() - 7 * 86_400_000);
    const end = to
      ? new Date(to)
      : new Date(now.getTime() + (view === 'month' ? 31 : view === 'day' ? 1 : 7) * 86_400_000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'Période invalide.' });
    }
    if (end.getTime() - start.getTime() > 400 * 86_400_000) {
      throw new BadRequestException({ code: 'RANGE_TOO_WIDE', message: 'La période demandée est trop large (400 jours maximum).' });
    }

    const [blocks, availability, tasks] = await Promise.all([
      this.prisma.planningBlock.findMany({
        where: { userId: user.id, startAt: { lt: end }, endAt: { gt: start } },
        orderBy: { startAt: 'asc' },
        include: { subject: { select: { name: true, color: true } } },
      }),
      this.prisma.availability.findMany({ where: { userId: user.id }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }),
      this.prisma.goal.findMany({ where: { userId: user.id, status: 'ACTIVE' }, include: { subject: { select: { name: true } } } }),
    ]);

    return { from: start, to: end, blocks, availability, goals: tasks };
  }

  @Post('blocks')
  @ApiOperation({ summary: 'Créer un bloc de travail' })
  async createBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(planningBlockSchema))
    body: { title: string; type: string; subjectId?: string | null; startAt: Date; endAt: Date; priority: number; notes?: string | null },
  ) {
    return this.prisma.planningBlock.create({
      data: {
        userId: user.id,
        subjectId: body.subjectId ?? null,
        title: body.title,
        type: body.type,
        startAt: body.startAt,
        endAt: body.endAt,
        priority: body.priority,
        notes: body.notes ?? null,
      },
    });
  }

  @Patch('blocks/:id')
  @ApiOperation({ summary: 'Modifier un bloc (décaler, compléter, annuler)' })
  async updateBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status?: string; startAt?: string; endAt?: string; title?: string; notes?: string },
  ) {
    const result = await this.prisma.planningBlock.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(body.status ? { status: body.status, completedAt: body.status === 'TERMINE' ? new Date() : null } : {}),
        ...(body.startAt ? { startAt: new Date(body.startAt) } : {}),
        ...(body.endAt ? { endAt: new Date(body.endAt) } : {}),
        ...(body.title ? { title: body.title.slice(0, 120) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: 'Créneau introuvable.' });
    return this.prisma.planningBlock.findUniqueOrThrow({ where: { id } });
  }

  @Delete('blocks/:id')
  @ApiOperation({ summary: 'Supprimer un bloc' })
  async deleteBlock(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const result = await this.prisma.planningBlock.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: 'Créneau introuvable.' });
    return { success: true };
  }

  @Post('availability')
  @ApiOperation({ summary: 'Définir ses disponibilités hebdomadaires' })
  async setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(availabilityInput)) body: { slots: { weekday: number; startMinute: number; endMinute: number }[] },
  ) {
    for (const slot of body.slots) {
      if (slot.endMinute <= slot.startMinute) {
        throw new BadRequestException({ code: 'INVALID_SLOT', message: 'Une disponibilité se termine avant de commencer.' });
      }
    }
    await this.prisma.$transaction([
      this.prisma.availability.deleteMany({ where: { userId: user.id } }),
      this.prisma.availability.createMany({
        data: body.slots.map((slot) => ({ userId: user.id, ...slot })),
      }),
    ]);
    return this.prisma.availability.findMany({ where: { userId: user.id }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] });
  }

  /**
   * Génère une proposition de planning réaliste : respecte les disponibilités,
   * insère des pauses, priorise les échéances et les notions fragiles.
   * Rien n'est imposé : l'étudiant peut tout modifier ensuite.
   */
  @Post('auto')
  @ApiOperation({ summary: 'Proposer un planning à partir des échéances et des lacunes' })
  async autoPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(autoPlanInput))
    body: { from: Date; to: Date; sessionMinutes: number; breakMinutes: number; maxSessionsPerDay: number; save: boolean },
  ) {
    const availability = await this.prisma.availability.findMany({ where: { userId: user.id } });
    if (availability.length === 0) {
      throw new BadRequestException({
        code: 'NO_AVAILABILITY',
        message:
          'Renseignez d’abord vos disponibilités hebdomadaires : le planning doit s’adapter à votre emploi du temps réel, pas l’inverse.',
      });
    }

    const [goals, exams, fragileCards, dueCards] = await Promise.all([
      this.prisma.goal.findMany({ where: { userId: user.id, status: 'ACTIVE' }, include: { subject: true } }),
      this.prisma.planningBlock.findMany({
        where: { userId: user.id, type: { in: ['EXAMEN', 'DEVOIR'] }, startAt: { gte: body.from } },
        include: { subject: true },
      }),
      this.prisma.flashcard.groupBy({
        by: ['subjectId'],
        where: { userId: user.id, masteryStatus: { in: ['FRAGILE', 'EN_COURS'] } },
        _count: { _all: true },
      }),
      this.prisma.flashcard.count({ where: { userId: user.id, dueAt: { lte: new Date() } } }),
    ]);

    const tasks: SchedulingTask[] = [];

    for (const exam of exams) {
      tasks.push({
        id: `exam-${exam.id}`,
        title: `Préparer : ${exam.title}`,
        subjectId: exam.subjectId,
        type: 'REVISION',
        priority: 5,
        dueAt: exam.startAt,
      });
    }
    for (const goal of goals) {
      tasks.push({
        id: `goal-${goal.id}`,
        title: `Objectif : ${goal.title}`,
        subjectId: goal.subjectId,
        type: 'REVISION',
        priority: goal.targetValue - goal.currentValue > goal.targetValue / 2 ? 4 : 3,
        dueAt: goal.dueAt,
      });
    }
    for (const group of fragileCards) {
      if (!group.subjectId) continue;
      tasks.push({
        id: `fragile-${group.subjectId}`,
        title: `Consolider les notions fragiles (${group._count._all})`,
        subjectId: group.subjectId,
        type: 'REVISION',
        priority: 4,
      });
    }
    if (dueCards > 0) {
      tasks.push({
        id: 'due-cards',
        title: `Révisions dues (${dueCards} cartes)`,
        type: 'REVISION',
        priority: 4,
      });
    }
    if (tasks.length === 0) {
      tasks.push({ id: 'discovery', title: 'Découvrir un cours et créer des fiches', type: 'COURS', priority: 2 });
    }

    const plan = generatePlanning(tasks, {
      from: body.from,
      to: body.to,
      sessionMinutes: body.sessionMinutes,
      breakMinutes: body.breakMinutes,
      maxSessionsPerDay: body.maxSessionsPerDay,
      availability: availability.map((slot) => ({
        weekday: slot.weekday,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      })),
    });

    let created: { id: string }[] = [];
    if (body.save && plan.blocks.length > 0) {
      const records = await this.prisma.$transaction(
        plan.blocks.map((block) =>
          this.prisma.planningBlock.create({
            data: {
              userId: user.id,
              subjectId: block.subjectId ?? null,
              title: block.title,
              type: block.type,
              startAt: block.startAt,
              endAt: block.endAt,
              priority: block.priority,
              rationale: block.rationale,
            },
            select: { id: true },
          }),
        ),
      );
      created = records;
    }

    return {
      blocks: plan.blocks.map((block, index) => ({ ...block, id: created[index]?.id ?? null })),
      unscheduled: plan.unscheduled,
      saved: body.save,
      message: plan.blocks.length
        ? `${plan.blocks.length} séance(s) proposée(s). Vous pouvez les décaler ou les supprimer librement.`
        : 'Aucune séance n’a pu être placée dans les disponibilités indiquées.',
    };
  }

  /** Minuteur Pomodoro : sessions réelles enregistrées (statistiques fiables). */
  @Post('pomodoro/start')
  @ApiOperation({ summary: 'Démarrer une session de concentration (Pomodoro)' })
  async startPomodoro(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sessionInput))
    body: { subjectId?: string | null; focusMinutes: number; breakMinutes: number; cycles: number },
  ) {
    return this.prisma.studySession.create({
      data: {
        userId: user.id,
        subjectId: body.subjectId ?? null,
        focusMinutes: body.focusMinutes,
        breakMinutes: body.breakMinutes,
        cycles: body.cycles,
        kind: 'POMODORO',
      },
    });
  }

  @Post('pomodoro/:id/complete')
  @ApiOperation({ summary: 'Clôturer une session (durée réelle)' })
  async completePomodoro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.prisma.studySession.updateMany({
      where: { id, userId: user.id },
      data: { completed: true, endedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session introuvable.' });
    return { success: true };
  }

  @Get('pomodoro')
  @ApiOperation({ summary: 'Historique des sessions de concentration' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.studySession.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
  }
}
