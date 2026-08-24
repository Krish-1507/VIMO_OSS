import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';

/**
 * Wrap a model so the AI SDK's streaming API works even when the underlying
 * endpoint does not support Server-Sent-Events streaming.
 *
 * Needed because some OpenAI-compatible backends (e.g. Pollinations' anonymous
 * tier) reject `"stream": true` with HTTP 500 while serving plain completions
 * just fine. doStream() simply performs a regular generation and replays the
 * complete result as stream parts, so everything downstream (deltas, tool
 * calls, step handling) keeps working unchanged.
 */
export function asNonStreamingModel(model: LanguageModelV1): LanguageModelV1 {
  return {
    provider: model.provider,
    modelId: model.modelId,
    specificationVersion: 'v1',
    defaultObjectGenerationMode: model.defaultObjectGenerationMode,

    doGenerate: (options: LanguageModelV1CallOptions) => model.doGenerate(options),

    async doStream(options: LanguageModelV1CallOptions) {
      const result = await model.doGenerate(options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: LanguageModelV1StreamPart[] = [];
      if (result.text) {
        parts.push({ type: 'text-delta', textDelta: result.text });
      }
      for (const call of result.toolCalls ?? []) {
        parts.push({
          type: 'tool-call',
          toolCallType: call.toolCallType ?? 'function',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          args: call.args,
        } as LanguageModelV1StreamPart);
      }
      parts.push({
        type: 'finish',
        finishReason: result.finishReason,
        usage: result.usage,
      });

      const iterator = parts[Symbol.iterator]();
      const stream = new ReadableStream<LanguageModelV1StreamPart>({
        pull(controller) {
          const next = iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
      });

      return {
        stream,
        rawCall: result.rawCall,
      };
    },
  };
}
