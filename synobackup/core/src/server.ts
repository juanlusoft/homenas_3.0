import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { router } from './routes.js';
import { loadState } from './state.js';
import { startTcpUploadServer } from './tcp-upload.js';

loadState();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/synobackup', router);

app.listen(config.port, config.host, () => {
  console.log(`[synobackup-core] listening on http://${config.host}:${config.port}`);
});

startTcpUploadServer();
