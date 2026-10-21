// Os efeitos sonoros das comemorações: opcionais (desligados por padrão, nas preferências) e sintetizados na hora
// com a Web Audio API, sem arquivos. Notas curtas de videogame antigo, como o resto do pixel art.
import { ler, CHAVES } from '../armazenamento.js';

let audio = null;

/** Uma nota com envelope curto (sem estalo no começo e no fim). */
function nota(freq, inicio, duracao, { onda = 'square', volume = 0.05, grave = false } = {}) {
  const osc = audio.createOscillator();
  const ganho = audio.createGain();
  osc.type = onda;
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0, inicio);
  ganho.gain.linearRampToValueAtTime(volume, inicio + 0.015);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  let saida = ganho;
  if (grave) { // o apito do navio: um filtro tira o chiado da onda dente de serra
    const filtro = audio.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 420;
    ganho.connect(filtro);
    saida = filtro;
  }
  osc.connect(ganho);
  saida.connect(audio.destination);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.05);
}

const SONS = {
  // contêiner embarcado: um arpejo que sobe (dó, mi, sol, dó)
  embarque: (t) => [523, 659, 784, 1047].forEach((f, i) => nota(f, t + i * 0.08, 0.14)),
  // lacre: o baque do carimbo e um brilho
  lacre: (t) => {
    nota(98, t, 0.25, { onda: 'triangle', volume: 0.22 });
    [1047, 1319, 1568, 2093].forEach((f, i) => nota(f, t + 0.18 + i * 0.07, 0.2, { volume: 0.035 }));
  },
  // navio carregado: o apito, duas notas graves juntas
  navio: (t) => {
    nota(98, t, 1.3, { onda: 'sawtooth', volume: 0.09, grave: true });
    nota(123.5, t, 1.3, { onda: 'sawtooth', volume: 0.07, grave: true });
  },
};

/** Toca um efeito, se o aluno ligou os sons. */
export function tocar(nome, { mesmoDesligado = false } = {}) {
  if (!mesmoDesligado && ler(CHAVES.preferencias, {}).som !== 'ligado') return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    SONS[nome]?.(audio.currentTime + 0.02);
  } catch { /* sem Web Audio: segue em silêncio */ }
}
