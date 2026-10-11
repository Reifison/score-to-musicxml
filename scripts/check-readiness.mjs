const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error('Informe a URL /ready do ambiente.');
  process.exit(1);
}
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  if (!response.ok || !['database', 'redis', 'worker'].every(key => body.checks?.[key] === true)) {
    console.error('Conversão indisponível: verifique banco, Redis e heartbeat do worker.');
    process.exitCode = 1;
  } else {
    console.log('Banco, Redis e worker prontos. Falta executar o smoke test de conversão.');
  }
} catch {
  console.error('Readiness não respondeu dentro do limite; liberação permanece pendente.');
  process.exitCode = 1;
}
