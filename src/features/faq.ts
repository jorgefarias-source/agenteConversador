export interface FaqEntry {
  id: string;
  theme: string;
  question: string;
  answer: string;
  approvedBy: string;
  status: 'rascunho' | 'aprovado';
}

export interface FaqVersion {
  businessId: string;
  businessName: string;
  version: string;
  updatedAt: string;
  entries: FaqEntry[];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, '');
}

function oneEditOrLessDistance(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (edits >= 1) {
      return false;
    }
    edits += 1;

    if (a.length > b.length) {
      i += 1;
      continue;
    }
    if (b.length > a.length) {
      j += 1;
      continue;
    }
    i += 1;
    j += 1;
  }

  return (a.length - i) + (b.length - j) <= 1;
}

function asciiFold(value: string): string {
  return normalize(value)
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function faqByBusiness(businessId: string): FaqVersion {
  const now = new Date().toISOString();

  const demoBase: Omit<FaqVersion, 'businessId' | 'businessName'> = {
    version: 'faq-v0-demo',
    updatedAt: now,
    entries: [
      {
        id: 'FAQ-001',
        theme: 'entrega',
        question: 'Vocês fazem entrega?',
        answer: 'Na versão de laboratório usamos informações de exemplo e não confirmamos disponibilidade real.',
        approvedBy: 'Pré-projeto',
        status: 'aprovado',
      },
      {
        id: 'FAQ-002',
        theme: 'retirada',
        question: 'Posso retirar no balcão?',
        answer: 'Sim, a retirada pode ser informada pela equipe quando necessário. Confirmação real entra no piloto.',
        approvedBy: 'Pré-projeto',
        status: 'aprovado',
      },
      {
        id: 'FAQ-003',
        theme: 'pagamento',
        question: 'Quais formas de pagamento?',
        answer: 'Use o fluxo oficial do atendimento. No laboratório tratamos como resposta de exemplo e não final.',
        approvedBy: 'Pré-projeto',
        status: 'aprovado',
      },
      {
        id: 'FAQ-004',
        theme: 'cardapio',
        question: 'Cardápio',
        answer: 'No momento o cardápio completo não está disponível no laboratório; confirme com a equipe comercial para atualização real.',
        approvedBy: 'Pré-projeto',
        status: 'aprovado',
      },
    ],
  };

  const fallback: FaqVersion = {
    ...demoBase,
    businessId: 'demonstração',
    businessName: 'Loja de Demonstração',
  };

  if (businessId === 'ponto-do-recheio') {
    return {
      ...fallback,
      businessId: 'ponto-do-recheio',
      businessName: 'Ponto do Recheio',
      version: 'faq-v1',
    };
  }

  return fallback;
}

export function answerFromFaq(faq: FaqVersion, message: string): FaqEntry | undefined {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return undefined;
  }

  const messageTokens = tokenize(message);

  return faq.entries.find((entry) => {
    const normalizedQuestion = normalize(entry.question);
    const normalizedQuestionAscii = asciiFold(entry.question);
    const qTokens = tokenize(entry.question);
    const qTokensAscii = tokenize(normalizedQuestionAscii);
    const compactQuestion = compact(entry.question);

    const directMatch =
      normalizedQuestion.includes(normalizedMessage) ||
      normalizedMessage.includes(normalizedQuestion) ||
      normalizedQuestionAscii.includes(asciiFold(message)) ||
      asciiFold(message).includes(normalizedQuestionAscii);
    if (directMatch) {
      return true;
    }

    const messageTokensAscii = tokenize(asciiFold(message));
    const shared = qTokens.filter((token) => messageTokens.includes(token)).length;
    const sharedAscii = qTokensAscii.filter((token) => messageTokensAscii.includes(token)).length;
    const requiredOverlap = Math.max(1, Math.ceil(qTokens.length / 2));
    const compactMessage = compact(message);
    return shared >= requiredOverlap || sharedAscii >= requiredOverlap || compactMessage.includes(compactQuestion) || oneEditOrLessDistance(compactMessage, compactQuestion);
  });
}
