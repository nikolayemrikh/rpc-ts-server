# rpc-ts-server

A TypeScript RPC server library.

## Installation

```bash
npm install @nikolayemrikh/rpc-ts-server
```

## Usage

```typescript
import { createRPCServer } from '@nikolayemrikh/rpc-ts-server';
import { serve } from '@hono/node-server'

const server = createRPCServer();

serve({
  fetch: server.fetch,
  port: 3000,
});
```
