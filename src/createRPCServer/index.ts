import { Hono } from 'hono';
import { generateSchema } from '../generateSchema/index.js';

export const createRPCServer = (
  sourceFilePath: string,
  rpcMethods: Record<string, (...args: unknown[]) => Promise<unknown>>
) => {
  const app = new Hono();

  // Эндпоинт для получения схемы
  app.get('/schema', async (c) => {
    const schema = generateSchema(sourceFilePath);
    return c.text(schema);
  });

  // Эндпоинт для вызова методов
  app.post('/call', async (c) => {
    const { method, params } = await c.req.json();

    if (!rpcMethods[method]) {
      return c.json({ error: 'Method not found' }, 404);
    }

    try {
      const result = await rpcMethods[method](...params);
      return c.json({ result });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
    }
  });

  return app;
};
