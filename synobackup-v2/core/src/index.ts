import { createHttpApp } from './http-server.js';
import { loadState, config } from './state.js';
import { startTcpServer } from './tcp-server.js';

loadState();

const app = createHttpApp();
app.listen(config.httpPort, config.host, () => {
  console.log(`[synobackup-v2-core] http listening on http://${config.host}:${config.httpPort}`);
});

startTcpServer();

