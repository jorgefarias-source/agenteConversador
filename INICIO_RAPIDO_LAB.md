# Início rápido do projeto (Etapa 2)

## 1) Ambiente local

```powershell
cd C:\Projetos\Conversador\agenteConversador
node --version
npm.cmd --version
``` 

## 2) Instalação

```powershell
npm.cmd ci
```

## 3) Verificação local

```powershell
npm.cmd run lab
```

Abra: `http://127.0.0.1:3000`

## 4) Exercícios do laboratório

- Enviar 2 mensagens no mesmo fluxo para validar isolamento
- Trocar o negócio no seletor e comparar versão/fonte
- Testar mensagem fora do FAQ → resposta de encaminhamento para humano
- Clicar "Nova conversa"

## 5) Comandos não-funcionais de qualidade (sem ambiente de produção)

- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run eval:local`

Sem alterações de WhatsApp ou dados reais nesta fase.
