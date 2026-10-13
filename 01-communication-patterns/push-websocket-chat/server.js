// Push com WebSocket.
// No request-response o servidor só fala quando é perguntado.
// Aqui o cliente abre UMA conexão que fica aberta, e o servidor pode
// mandar mensagens a qualquer momento, sem ninguém pedir.
//
// Dois usos do push neste lab:
//   1. Chat: uma mensagem de um cliente é empurrada para todos os outros.
//   2. Job: o comando "/job <nome>" inicia um job e o servidor empurra o
//      progresso; "/cancel" cancela no meio (o canal é bidirecional).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const JOB_STEP_MS = Number(process.env.JOB_STEP_MS || 1000); // 10 passos por job

// Servidor HTTP comum: entrega a página do chat.
// O WebSocket começa como uma requisição HTTP e é "promovida" (upgrade).
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});

// O WebSocketServer se pendura no servidor HTTP e trata as requisições
// com "Upgrade: websocket". Depois do handshake, a conexão TCP deixa de
// falar HTTP e passa a trocar frames WebSocket nos dois sentidos.
const wss = new WebSocketServer({ server: httpServer });

let nextId = 1;
const clients = new Map(); // ws -> { name, job }

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  for (const ws of clients.keys()) if (ws !== except) send(ws, msg);
}

function startJob(ws, name) {
  const client = clients.get(ws);
  if (client.job) return send(ws, { type: 'system', text: 'Você já tem um job rodando. Use /cancel.' });

  let progress = 0;
  send(ws, { type: 'job', name, progress, status: 'started' });

  // Ninguém pergunta "terminou?". O servidor EMPURRA cada atualização.
  const timer = setInterval(() => {
    progress += 10;
    if (progress < 100) return send(ws, { type: 'job', name, progress, status: 'running' });
    clearInterval(timer);
    client.job = null;
    send(ws, { type: 'job', name, progress, status: 'done' });
  }, JOB_STEP_MS);

  client.job = { name, timer };
}

function cancelJob(ws) {
  const client = clients.get(ws);
  if (!client?.job) return false;
  clearInterval(client.job.timer); // aqui o cancelamento é REAL, diferente do request-response
  const { name } = client.job;
  client.job = null;
  return name;
}

wss.on('connection', (ws, req) => {
  const name = `user-${nextId++}`;
  clients.set(ws, { name, job: null });
  console.log(`+ ${name} conectou (${req.socket.remoteAddress}) — ${clients.size} online`);

  send(ws, { type: 'welcome', name, online: clients.size });
  broadcast({ type: 'system', text: `${name} entrou no chat` }, ws);

  ws.on('message', (data) => {
    const text = data.toString().trim();
    if (!text) return;

    if (text.startsWith('/job')) return startJob(ws, text.slice(4).trim() || 'relatório');
    if (text === '/cancel') {
      const cancelled = cancelJob(ws);
      return send(ws, cancelled
        ? { type: 'job', name: cancelled, status: 'cancelled' }
        : { type: 'system', text: 'Nenhum job em andamento.' });
    }

    console.log(`  ${name}: ${text}`);
    broadcast({ type: 'chat', from: name, text });
  });

  // Conexão persistente tem estado: o servidor precisa saber quando ela cai
  // para limpar recursos (aqui, cancelar o job que ninguém mais vai receber).
  ws.on('close', () => {
    const cancelled = cancelJob(ws);
    clients.delete(ws);
    console.log(`- ${name} saiu${cancelled ? ` (job "${cancelled}" cancelado)` : ''} — ${clients.size} online`);
    broadcast({ type: 'system', text: `${name} saiu do chat` });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Chat em http://localhost:${PORT} (WebSocket em ws://localhost:${PORT})`);
});