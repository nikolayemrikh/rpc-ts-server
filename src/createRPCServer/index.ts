import { Hono } from 'hono';
import { BlankEnv, BlankSchema, Env, Schema } from 'hono/types';
import { generateSchema } from '../generateSchema/index.js';
import { IMethods, TMethod } from './types.js';

export const createRPCServer = <
  E extends Env = BlankEnv,
  S extends Schema = BlankSchema,
  BasePath extends string = '/',
>(
  tsConfigPath: string,
  projectRoot: string,
  sourceFilePath: string,
  app: Hono<E, S, BasePath>,
  rpcMethods: IMethods
): void => {
  // Эндпоинт для получения схемы
  app.get('/types', async (c) => {
    const archive = await generateSchema(tsConfigPath, projectRoot, sourceFilePath);
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', 'attachment; filename="types.zip"');
    return c.body(archive);
  });

  // Эндпоинт для вызова методов
  app.post('/call', async (c) => {
    const { method, params } = await c.req.json<{ method: string; params: unknown[] }>();

    const path = method.split('.');
    let current = rpcMethods;

    while (path.length > 1) {
      const p = path.shift();
      if (typeof current === 'object') {
        current = current[p!] as IMethods;
      } else {
        return c.json({ error: 'Method not found' }, 404);
      }
    }

    const func = current[path[0]] as TMethod;

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
