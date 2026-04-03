import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { activeBackupRouter } from './routes/active-backup.js';
import { loadState } from './state.js';

loadState();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'active-backup-core' });
});

app.use('/api/active-backup', activeBackupRouter);

app.listen(config.port, config.host, () => {
  console.log(`[active-backup-core] listening on http://${config.host}:${config.port}`);
});
