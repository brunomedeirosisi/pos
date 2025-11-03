import express from 'express';

const app = express();
app.use(express.json());

// Stub printing endpoint (ESC/POS payload expected)
app.post('/print', (req, res) => {
  console.log('[agent] print job received:', req.body);
  // TODO: send raw ESC/POS to local USB/Serial or network printer (9100)
  res.json({ ok: true });
});

const port = 9222;
app.listen(port, '127.0.0.1', () => {
  console.log(`[agent] listening on http://127.0.0.1:${port}`);
});
