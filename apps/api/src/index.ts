import { serve } from '@hono/node-server';
import { createApp } from './app';

const port = 3001;

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
