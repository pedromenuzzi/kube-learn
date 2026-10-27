// O rodízio do Plantão do dia: qual morador chama em cada dia. Fica fora de plantao.js (que monta o incidente, com os
// defeitos e o cluster) porque a página inicial só mostra o link do chamado de hoje e não precisa levar o resto.
import { t } from '../i18n.js';

/** O plantão é recomendado a partir deste nível (os defeitos passam por probes, limites e agendamento). */
export const NIVEL_DO_PLANTAO = 6;

/**
 * As aplicações dos moradores (todas rodam a loja virtual kubelearn/loja; o `app` é nome de recurso, um rótulo DNS).
 * Oito, uma por dia em rodízio: a página do Plantão mostra hoje e os 7 dias anteriores, e nenhum título se repete nela.
 */
export const CENARIOS = [
  { app: 'padaria', titulo: () => t('A padaria fora do ar'), morador: () => t('Dona Rosa, da padaria do térreo'), relato: () => t('Atualizei o sistema de encomendas ontem à noite, seguindo um tutorial, e hoje de manhã ninguém consegue fazer pedido. O pão está esfriando!') },
  { app: 'farmacia', titulo: () => t('A farmácia sem sistema'), morador: () => t('Seu Antônio, da farmácia'), relato: () => t('O sistema da farmácia parou depois que o meu sobrinho "deu uma arrumada" nos arquivos. Tenho receita para separar e nada funciona.') },
  { app: 'academia', titulo: () => t('O app da academia não abre'), morador: () => t('Carla, da academia do 2º andar'), relato: () => t('Mexeram na configuração do app da academia para a promoção de verão, e agora ele não abre. Os alunos estão reclamando na porta.') },
  { app: 'biblioteca', titulo: () => t('O catálogo da biblioteca sumiu'), morador: () => t('Seu Benedito, da biblioteca do condomínio'), relato: () => t('O catálogo sumiu depois da manutenção de domingo. Os leitores não conseguem reservar livro nenhum.') },
  { app: 'lavanderia', titulo: () => t('A lavanderia parada'), morador: () => t('Dona Lúcia, da lavanderia'), relato: () => t('Desde a mudança de servidor, o painel de pedidos da lavanderia não responde. As roupas estão se acumulando!') },
  { app: 'pizzaria', titulo: () => t('A pizzaria sem pedidos'), morador: () => t('Seu Giuseppe, da pizzaria da esquina'), relato: () => t('Meu neto mexeu no site de pedidos para o rodízio de sexta, e agora não entra um pedido. O forno está quente e as mesas vazias!') },
  { app: 'floricultura', titulo: () => t('A vitrine da floricultura apagou'), morador: () => t('Dona Hortência, da floricultura da entrada'), relato: () => t('A vitrine on-line da floricultura saiu do ar depois que trocaram umas configurações. Tenho três casamentos para atender esta semana!') },
  { app: 'mercadinho', titulo: () => t('O mercadinho sem entregas'), morador: () => t('Dona Fátima, do mercadinho do bloco B'), relato: () => t('Depois que atualizaram o app de entregas do mercadinho, nenhum pedido chega. Tem cliente ligando para saber da compra!') },
];

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 'AAAA-MM-DD' que existe no calendário, de 1970 em diante (mês 13 e dia 00 não; o dia antes de 1970 daria n negativo). */
const dataValida = (dia) => {
  const [, ano, mes, d] = DATA.exec(dia ?? '') ?? [];
  return Number(ano) >= 1970 && new Date(Date.UTC(ano, mes - 1, d)).toISOString().startsWith(dia);
};

/** O número do dia desde 1970-01-01, que move o rodízio. Data inválida → null. */
export const numeroDoDia = (dia) => (dataValida(dia) ? Date.parse(`${dia}T00:00:00Z`) / 86_400_000 : null);

/** O chamado do dia sem o incidente: o id e o título, os mesmos de plantaoDoDia. Data inválida → null. */
export function chamadoDoDia(dia) {
  const n = numeroDoDia(dia);
  return n === null ? null : { id: `plantao-${dia}`, titulo: CENARIOS[n % CENARIOS.length].titulo(), secao: 'plantao' };
}
