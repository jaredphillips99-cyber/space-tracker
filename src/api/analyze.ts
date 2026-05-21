export interface AnalyzeRequest {
  ticker: string;
  earningsText?: string;
  transcriptText?: string;
}

export interface AnalyzeStreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: string) => void;
}

export async function streamAnalysis(
  req: AnalyzeRequest,
  callbacks: AnalyzeStreamCallbacks,
): Promise<void> {
  let res: Response;

  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch (err) {
    callbacks.onError(String(err));
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    callbacks.onError(`HTTP ${res.status}: ${text}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    // Parse SSE format: "data: <text>\n\n"
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const text = parsed?.delta?.text ?? parsed?.text ?? '';
          if (text) {
            accumulated += text;
            callbacks.onChunk(text);
          }
        } catch {
          // Non-JSON data line — skip
        }
      }
    }
  }

  callbacks.onDone(accumulated);
}
