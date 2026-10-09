const timeoutMs = Number(process.argv[2]) || undefined;
const url = process.env.URL || 'http://localhost:3000/jobs';

async function main() {
  const start = Date.now();
  console.log(`Enviando job para ${url}${timeoutMs ? ` (timeout ${timeoutMs}ms)` : ''}...`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: 'vendas-outubro' }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const body = await res.json();
    console.log(`Resposta ${res.status} após ${Date.now() - start}ms:`, body);
  } catch (err) {
    console.log(`Falhou após ${Date.now() - start}ms: ${err.name} - ${err.message}`);
    console.log('O cliente desistiu, mas o servidor CONTINUA processando o job (veja o log dele).');
  }
}

main();