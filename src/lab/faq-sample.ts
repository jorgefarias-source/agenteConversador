export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const sampleFaq: FaqItem[] = [
  { id: 'FAQ-001', question: 'Vocês fazem entrega?', answer: 'Este é o laboratório; a resposta é simulada.' },
  { id: 'FAQ-002', question: 'Posso retirar no balcão?', answer: 'No laboratório, resposta de exemplo aprovada para teste.' },
];

export function findByQuestion(question: string): FaqItem | undefined {
  return sampleFaq.find((item) =>
    item.question.toLowerCase().includes(question.trim().toLowerCase()) ||
    question.toLowerCase().includes(item.question.toLowerCase()),
  );
}
