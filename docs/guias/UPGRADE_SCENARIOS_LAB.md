# Atualização de avanço — Etapa 3 (30 cenarios)

- `src/lab/scenarios.json` expandido para os 30 cenários (20 atendimento + 10 falha/segurança).
- `src/lab/eval-local.ts` atualizado para avaliar sem servidor HTTP, usando o motor de FAQ do lab diretamente.

Execução recomendada:

```powershell
npm.cmd run lab:scenarios
```

Relatórios gerados:
- `eval-local-report.md`
- `eval-local-report.json`

Observação:
- Esta versao mantém `fallback-human` como saída segura para itens sem base de FAQ aprovada.