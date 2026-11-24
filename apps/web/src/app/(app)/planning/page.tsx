import { apiFetch, formatDate } from '@/lib/api';
import { Badge, Card, EmptyState, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { PlanningTools } from '@/components/planning-tools';
import { PomodoroTimer } from '@/components/pomodoro-timer';

interface PlanningBlock {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  status: string;
  priority: number;
  rationale: string | null;
  subject: { name: string; color: string } | null;
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default async function PlanningPage() {
  const now = new Date();
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const to = new Date(now.getTime() + 21 * 86_400_000).toISOString();

  const [agenda, subjects] = await Promise.all([
    apiFetch<{
      blocks: PlanningBlock[];
      availability: { id: string; weekday: number; startMinute: number; endMinute: number }[];
      goals: { id: string; title: string; subject: { name: string } | null }[];
    }>(`/planning?from=${from}&to=${to}`),
    apiFetch<{ id: string; name: string; color: string }[]>('/subjects'),
  ]);

  const grouped = new Map<string, PlanningBlock[]>();
  for (const block of agenda.blocks) {
    const key = block.startAt.slice(0, 10);
    const list = grouped.get(key) ?? [];
    list.push(block);
    grouped.set(key, list);
  }

  return (
    <>
      <PageHeader
        title="Planning académique"
        subtitle="Un emploi du temps réaliste, construit à partir de vos disponibilités, de vos échéances et de vos lacunes — jamais l'inverse."
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle eyebrow="Agenda" title="Trois prochaines semaines" />
            {agenda.blocks.length === 0 ? (
              <EmptyState
                title="Aucune séance planifiée"
                description="Renseignez vos disponibilités puis laissez MÉMO CAMPUS proposer un planning : vous pourrez tout modifier ensuite."
              />
            ) : (
              <div className="space-y-4">
                {[...grouped.entries()].map(([date, blocks]) => {
                  const day = new Date(`${date}T12:00:00Z`);
                  return (
                    <div key={date}>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-memo-600">
                        {DAY_NAMES[day.getUTCDay()]} {formatDate(day)}
                      </p>
                      <ul className="space-y-1.5">
                        {blocks.map((block) => (
                          <li
                            key={block.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{block.title}</p>
                              <p className="text-xs text-muted">
                                {new Date(block.startAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  timeZone: 'Africa/Douala',
                                })}{' '}
                                –{' '}
                                {new Date(block.endAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  timeZone: 'Africa/Douala',
                                })}
                                {block.subject ? ` · ${block.subject.name}` : ''}
                              </p>
                              {block.rationale ? (
                                <p className="mt-0.5 text-[11px] text-muted">{block.rationale}</p>
                              ) : null}
                            </div>
                            <Badge tone={block.status === 'TERMINE' ? 'success' : 'neutral'}>{block.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <PlanningTools subjects={subjects} hasAvailability={agenda.availability.length > 0} />
        </div>

        <div className="space-y-4">
          <PomodoroTimer />
          <Card className="p-5">
            <SectionTitle eyebrow="Disponibilités" title="Vos créneaux déclarés" />
            {agenda.availability.length === 0 ? (
              <p className="text-sm text-muted">Aucune disponibilité renseignée pour l&apos;instant.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                  const slots = agenda.availability.filter((slot) => slot.weekday === weekday);
                  if (slots.length === 0) return null;
                  return (
                    <li key={weekday} className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{DAY_NAMES[weekday]}</span>
                      <span className="text-right text-muted">
                        {slots.map((slot) => `${minutes(slot.startMinute)}–${minutes(slot.endMinute)}`).join(', ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {agenda.goals.length > 0 ? (
            <Card className="p-5">
              <SectionTitle eyebrow="Objectifs" title="En cours" />
              <ul className="space-y-1.5 text-sm">
                {agenda.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center justify-between gap-2">
                    <span>{goal.title}</span>
                    <span className="text-xs text-muted">{goal.subject?.name ?? ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function minutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}h${String(value % 60).padStart(2, '0')}`;
}
