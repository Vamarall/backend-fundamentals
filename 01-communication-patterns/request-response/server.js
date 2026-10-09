const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = process.env.PORT || 3000;
const JOB_DURATION_MS = Number(process.env.JOB_DURATION_MS || 5000);

// Simula um trabalho demorado (gerar relatório, converter vídeo...).
// É assíncrono (setTimeout), então NÃO trava o event loop: outras requisições
// continuam sendo atendidas enquanto este job "processa".
function processJob(payload) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ input: payload, output: `relatório de ${payload.report ?? 'desconhecido'} pronto` });
    }, JOB_DURATION_MS);
  });
}

// Lê o corpo da requisição. Ele chega em pedaços (chunks) pelo socket TCP,
// então precisamos juntar tudo antes de fazer o parse.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  console.log(`--> ${req.method} ${req.url}`);
  res.on('finish', () => console.log(`<-- ${res.statusCode} ${req.method} ${req.url} (${Date.now() - start}ms)`));

  // GET /health — resposta imediata. Use para provar que o servidor continua
  // respondendo enquanto um job longo está em andamento.
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  // POST /jobs — o cliente fica preso nesta requisição até o job terminar.
  if (req.method === 'POST' && req.url === '/jobs') {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido' });
    }

    const jobId = randomUUID();
    console.log(`    job ${jobId} iniciado`);
    const result = await processJob(payload);
    console.log(`    job ${jobId} concluído`);
    return sendJson(res, 200, { jobId, status: 'done', result });
  }

  sendJson(res, 404, { error: 'rota não encontrada' });
});

server.listen(PORT, () => {
  console.log(`Servidor ouvindo em http://localhost:${PORT} (jobs levam ${JOB_DURATION_MS}ms)`);
});