import { Hono } from 'hono';
import { generateSchema } from '../generateSchema/index.js';
import { IMethods, TMethod } from './types.js';

export const createRPCServer = (projectRoot: string, sourceFilePath: string, app: Hono, rpcMethods: IMethods): void => {
  // Эндпоинт для получения схемы
  app.get('/types', async (c) => {
    const schema = generateSchema(projectRoot, sourceFilePath);
    return c.text(schema);
  });

  // Эндпоинт для вызова методов
  app.post('/call', async (c) => {
    const { method, params } = await c.req.json();

    const path = method.split('.');
    let current = rpcMethods;
    let func: TMethod | undefined;

    for (const p of path) {
      if (typeof current === 'function') {
        func = current;
      } else if (typeof current === 'object') {
        current = current[p] as IMethods;
      }
    }

    if (!func) {
      return c.json({ error: 'Method not found' }, 404);
    }

    try {
      const result = await func(...params);
      return c.json({ result });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
    }
  });
};
