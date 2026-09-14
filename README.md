# Guia rápido de Smoke do modo pilot

## Scripts úteis

- `npm run pilot`  
  Inicia o worker de laboratório em `127.0.0.1:3000` (ou valor de `PORT`).

- `npm run pilot:smoke`  
  Executa `src/lab/pilot-smoke.ts` contra `http://127.0.0.1:3000` por padrão.

- `npm run pilot:smoke:3001`  
  Executa o smoke contra `http://127.0.0.1:3001`.

- `npm run pilot:smoke:auto`  
  Lê `PILOT_SMOKE_PORT` (padrão `3000`) ou `PILOT_SMOKE_BASE_HOST` para montar a URL automaticamente.

## Como rodar o smoke em ambiente customizado

```bash
set PILOT_SMOKE_PORT=3001
npm run pilot:smoke:auto
```

ou

```bash
set PILOT_SMOKE_BASE_HOST=http://127.0.0.1:3001
npm run pilot:smoke:auto
```

Também é possível passar a URL direto pelo script:

```bash
npx tsx src/lab/pilot-smoke.ts --baseHost=http://127.0.0.1:3001
```

Para executar em um comando só no fluxo demo local:

```bash
npm run pilot:smoke:demo
```

## Observações importantes

- O comando `pilot` usa `PORT` e o smoke por padrão tenta `127.0.0.1:3000`.
- Se aparecer `EADDRINUSE`, encerre o processo que já está usando a porta (ex.: outra instância do projeto) antes de subir novamente.
- O smoke precisa do serviço ativo (`pilot`) na mesma host/porta informada no `baseHost`.
