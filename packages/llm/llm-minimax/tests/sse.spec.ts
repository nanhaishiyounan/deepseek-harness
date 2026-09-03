import { describe, expect, it } from 'vitest'
import { parseSse } from '../src/sse.ts'

async function collect(stream: AsyncGenerator<string>): Promise<string[]> {
  const values: string[] = []
  for await (const value of stream) values.push(value)
  return values
}

function byteStream(chunks: string[]): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })
}

describe('parseSse', () => {
  it('yields each data payload and ends normally at EOF without [DONE]', async () => {
    const values = await collect(parseSse(byteStream(['data: a\n\nda', 'ta: b\n\n'])))
    expect(values).toEqual(['a', 'b'])
  })

  it('passes a [DONE] sentinel through for the caller to own', async () => {
    const values = await collect(parseSse(byteStream(['data: [DONE]\n\n'])))
    expect(values).toEqual(['[DONE]'])
  })

  it('skips comments and non-data fields', async () => {
    const values = await collect(parseSse(byteStream([': keep-alive\nevent: x\ndata: real\n\n'])))
    expect(values).toEqual(['real'])
  })

  it('drops an unterminated tail event at EOF', async () => {
    const values = await collect(parseSse(byteStream(['data: a\n\ndata: trunc'])))
    expect(values).toEqual(['a'])
  })
})
