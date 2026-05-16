// Claude API 공통 헬퍼 — Edge Function에서 Claude 호출용
// 사용 모델 / 캐싱 등을 일관되게 처리

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-4-6';

export interface ClaudeCallParams {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface ClaudeResponse {
  text: string;
}

export async function callClaude(params: ClaudeCallParams): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: params.maxTokens ?? 250,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: params.userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API 오류 ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? '';
  if (!text) throw new Error('Claude 응답이 비어 있습니다.');

  return { text: text.trim() };
}
