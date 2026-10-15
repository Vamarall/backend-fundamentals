// Cliente de terminal. Usa o WebSocket nativo do Node 22+ (sem dependências).
// Digite mensagens e Enter. Comandos: /job <nome>, /cancel. Ctrl+C sai.

const readline = require('node:readline');

const url = process.env.URL || 'ws://localhost:3000';
const ws = new WebSocket(url);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

function print(line) {
  // Limpa a linha do prompt, imprime a mensagem e redesenha o prompt.
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(line);
  rl.prompt(true);
}

// Linhas digitadas antes da conexão abrir ficam numa fila e são enviadas no 'open'.
const pending = [];
rl.on('line', (line) => {
  if (line.trim()) ws.readyState === WebSocket.OPEN ? ws.send(line) : pending.push(line);
  rl.prompt();
});

ws.addEventListener('open', () => {
  print(`Conectado a ${url}. Comandos: /job <nome>, /cancel`);
  pending.splice(0).forEach((line) => ws.send(line));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'welcome': return print(`Você é ${msg.name} (${msg.online} online)`);
    case 'chat':    return print(`${msg.from}: ${msg.text}`);
    case 'system':  return print(`* ${msg.text}`);
    case 'job': {
      const bar = '#'.repeat((msg.progress ?? 0) / 10).padEnd(10, '.');
      return print(`[job ${msg.name}] [${bar}] ${msg.progress ?? '-'}% ${msg.status}`);
    }
  }
});

ws.addEventListener('close', () => { print('Conexão encerrada.'); process.exit(0); });
ws.addEventListener('error', () => { console.error(`Não consegui conectar em ${url}. O servidor está rodando?`); process.exit(1); });
rl.on('close', () => ws.close());