import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { AssistantChat } from '@/components/assistant-chat';

export const metadata = { title: 'Assistant' };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { conversation } = await searchParams;

  const [conversations, subjects] = await Promise.all([
    apiFetch<{ id: string; title: string; mode: string; updatedAt: string; _count: { messages: number } }[]>(
      '/assistant/conversations',
    ),
    apiFetch<{ id: string; name: string; color: string }[]>('/subjects'),
  ]);

  let initialMessages: { role: string; content: string; citations?: { index: number; documentTitle: string; page: number | null; extract: string }[] }[] = [];
  if (conversation) {
    const detail = await apiFetch<{ messages: typeof initialMessages }>(`/assistant/conversations/${conversation}`).catch(
      () => null,
    );
    initialMessages = detail?.messages ?? [];
  }

  return (
    <>
      <PageHeader
        title="Assistant MÉMO"
        subtitle="Un tuteur qui s'appuie sur vos cours et cite ses sources. Quand l'information n'y est pas, il le dit au lieu d'inventer."
      />
      <AssistantChat
        subjects={subjects}
        conversations={conversations}
        conversationId={conversation ?? null}
        initialMessages={initialMessages}
      />
    </>
  );
}
