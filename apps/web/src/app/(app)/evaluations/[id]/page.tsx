import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, formatDate } from '@/lib/api';
import { Badge, Card, ModeNotice, SectionTitle } from '@/components/ui';
import { PageHeader } from '@/components/shell';
import { ExamRunner } from '@/components/exam-runner';
import { FRENCH_LABELS, type AssessmentType } from '@memo/shared';

interface AssessmentDetail {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  durationMinutes: number;
  status: string;
  mode: string;
  maxScore: number;
  score: number | null;
  percentage: number | null;
  submittedAt: string | null;
  subject: { name: string; color: string } | null;
  questions: {
    id: string;
    orderIndex: number;
    type: 'MCQ' | 'WRITTEN';
    prompt: string;
    choices: { id: string; text: string }[];
    points: number;
    difficulty: string;
    sourceRef: { page?: number } | null;
    correctChoiceIds?: string[];
    explanation?: string;
    answer?: { selectedChoiceIds?: string[]; text?: string };
    awarded?: number;
    feedback?: string;
    needsHumanReview?: boolean;
    gradingRubric?: { criterion: string; points: number }[];
  }[];
  report: {
    corrections?: {
      questionId: string;
      type: 'MCQ' | 'WRITTEN';
      points: number;
      awarded: number;
      correct: boolean;
      selectedChoiceIds?: string[];
      correctChoiceIds?: string[];
      explanation?: string;
      misconceptions?: string[];
      rubricBreakdown?: { criterion: string; points: number; awarded: number; matched: boolean }[];
      feedback?: string;
      needsHumanReview?: boolean;
    }[];
    recommendations?: string[];
    weakNotions?: string[];
    mention?: string;
    percentage?: number;
    score?: number;
    maxScore?: number;
  } | null;
}

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let assessment: AssessmentDetail;
  try {
    assessment = await apiFetch<AssessmentDetail>(`/assessments/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const isSubmitted = Boolean(assessment.submittedAt);
  const corrections = assessment.report?.corrections ?? [];

  return (
    <>
      <PageHeader
        title={assessment.title}
        subtitle={`${assessment.subject?.name ?? 'Sans matière'} · ${FRENCH_LABELS.ASSESSMENT_TYPES[assessment.type as AssessmentType] ?? assessment.type} · ${assessment.questions.length} question(s) · ${assessment.durationMinutes} min`}
        action={
          <Link
            href="/evaluations"
            className="rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-semibold hover:border-memo-300"
          >
            ← Historique
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ModeNotice mode={assessment.mode === 'live' ? 'live' : 'demo'} />
        <Badge tone="neutral">Difficulté : {assessment.difficulty}</Badge>
        {isSubmitted ? (
          <Badge tone={(assessment.percentage ?? 0) >= 60 ? 'success' : 'danger'}>
            {assessment.percentage ?? 0}% · {formatDate(assessment.submittedAt, true)}
          </Badge>
        ) : (
          <Badge tone="info">Épreuve en cours</Badge>
        )}
      </div>

      {isSubmitted && corrections.length > 0 ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Note</p>
              <p className="text-2xl font-black">
                {assessment.score} / {assessment.maxScore}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Pourcentage</p>
              <p className="text-2xl font-black">{assessment.percentage}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Appréciation</p>
              <p className="text-2xl font-black">{assessment.report?.mention ?? '—'}</p>
            </Card>
          </div>

          {assessment.report?.recommendations && assessment.report.recommendations.length > 0 ? (
            <Card className="p-4">
              <SectionTitle eyebrow="Suite du travail" title="Recommandations" />
              <ul className="list-inside list-disc space-y-1 text-sm">
                {assessment.report.recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="space-y-3">
            <h2 className="text-lg font-bold">Correction détaillée</h2>
            {assessment.questions.map((question, index) => {
              const correction = corrections.find((item) => item.questionId === question.id);
              if (!correction) return null;
              const ratio = correction.points > 0 ? correction.awarded / correction.points : 0;
              return (
                <Card key={question.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">
                      {index + 1}. {question.prompt}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        ratio >= 0.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {correction.awarded} / {correction.points}
                    </span>
                  </div>

                  {question.type === 'MCQ' ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {question.choices.map((choice) => {
                        const isCorrect = correction.correctChoiceIds?.includes(choice.id);
                        const isChosen = correction.selectedChoiceIds?.includes(choice.id);
                        return (
                          <li
                            key={choice.id}
                            className={`rounded-lg px-2.5 py-1.5 ${
                              isCorrect
                                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
                                : isChosen
                                  ? 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200'
                                  : ''
                            }`}
                          >
                            <span className="mr-1.5 font-bold uppercase">{choice.id}.</span>
                            {choice.text}
                            {isCorrect ? <span className="ml-1.5 text-xs font-bold">✓ attendue</span> : null}
                            {isChosen && !isCorrect ? <span className="ml-1.5 text-xs font-bold">✗ cochée</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm">
                      {question.answer?.text ? (
                        <div className="rounded-lg bg-[var(--surface-muted)] p-2.5">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted">Votre réponse</p>
                          <p className="mt-1 whitespace-pre-wrap">{question.answer.text}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Aucune réponse fournie.</p>
                      )}
                      {correction.rubricBreakdown ? (
                        <table className="w-full text-xs">
                          <caption className="sr-only">Grille de correction appliquée</caption>
                          <thead>
                            <tr className="text-left text-muted">
                              <th scope="col">Critère</th>
                              <th scope="col">Points obtenus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {correction.rubricBreakdown.map((row) => (
                              <tr key={row.criterion} className="border-t border-[var(--border-subtle)]">
                                <td className="py-1">
                                  {row.matched ? '✓' : '✗'} {row.criterion}
                                </td>
                                <td className="py-1">
                                  {row.awarded} / {row.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                      {correction.feedback ? <p className="text-muted">{correction.feedback}</p> : null}
                    </div>
                  )}

                  {correction.explanation ? (
                    <p className="mt-2 rounded-lg bg-[var(--surface-muted)] p-2.5 text-sm">
                      <strong>Explication :</strong> {correction.explanation}
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <ExamRunner
          assessmentId={assessment.id}
          title={assessment.title}
          questions={assessment.questions}
          durationMinutes={assessment.durationMinutes}
          subjectName={assessment.subject?.name ?? null}
        />
      )}
    </>
  );
}
