/**
 * Service entry point. Binds to PORT (default 3000).
 */

import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`queue accounting service listening on port ${port}`);
});
