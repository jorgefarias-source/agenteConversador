# Etapa 3 — execução de cenários locais

Use:

```powershell
npm.cmd run lab
npm.cmd run lab:scenarios
```

Pré-requisitos:
- O servidor precisa estar rodando em `http://127.0.0.1:3000`
- O arquivo `src/lab/scenarios.json` pode ser expandido com os 30 cenários.

O comando gera:
- `eval-local-report.json`
- `eval-local-report.md`

Use o relatório para preencher:
- `modelos/04_RESULTADOS_DA_AVALIACAO.md`
