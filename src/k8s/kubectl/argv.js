// Linha de comando: quebra em palavras (com aspas, como o shell) e lê as flags como o cobra/pflag.

/** 'kubectl get pods -o jsonpath="{.items[*]}"' → ['kubectl', 'get', 'pods', '-o', 'jsonpath={.items[*]}'] */
export function palavras(linha) {
  const saida = [];
  let atual = null;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === "'") {
      const fim = linha.indexOf(c, i + 1);
      atual = (atual ?? '') + linha.slice(i + 1, fim === -1 ? undefined : fim);
      i = fim === -1 ? linha.length : fim;
    } else if (c === '"') {
      // Nas aspas duplas, como no bash, a barra só escapa " \ $ e a crase: {\"\n\"} vira {"\n"}.
      atual ??= '';
      for (i++; i < linha.length && linha[i] !== '"'; i++) {
        if (linha[i] === '\\' && i + 1 < linha.length && '"\\$`'.includes(linha[i + 1])) i++;
        atual += linha[i];
      }
    } else if (c === '\\' && i + 1 < linha.length) {
      atual = (atual ?? '') + linha[++i];
    } else if (/\s/.test(c)) {
      if (atual !== null) saida.push(atual);
      atual = null;
    } else {
      atual = (atual ?? '') + c;
    }
  }
  if (atual !== null) saida.push(atual);
  return saida;
}

export class ErroFlag extends Error {}

/**
 * Lê as flags. `definicoes`: { nome: { curto, tipo: 'bool'|'string'|'int'|'lista', padrao } }.
 * Devolve { flags, posicionais, depois } — `depois` é o que vem após `--`.
 */
export function lerFlags(args, definicoes) {
  const flags = {};
  const posicionais = [];
  let depois = null;
  const porCurto = Object.fromEntries(Object.entries(definicoes).filter(([, d]) => d.curto).map(([n, d]) => [d.curto, n]));
  for (const [n, d] of Object.entries(definicoes)) if (d.padrao !== undefined) flags[n] = d.padrao;

  const atribuir = (nome, valor, rotulo) => {
    const d = definicoes[nome];
    if (d.tipo === 'int') {
      if (!/^-?\d+$/.test(valor)) throw new ErroFlag(`invalid argument "${valor}" for "${rotulo}" flag: strconv.ParseInt: parsing "${valor}": invalid syntax`);
      flags[nome] = Number(valor);
    } else if (d.tipo === 'lista') {
      flags[nome] = [...(flags[nome] === d.padrao ? [] : flags[nome] ?? []), valor];
    } else if (d.tipo === 'bool') {
      flags[nome] = valor !== 'false';
    } else flags[nome] = valor;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      depois = args.slice(i + 1);
      break;
    }
    if (a.startsWith('--') && a.length > 2) {
      const [nome, ...resto] = a.slice(2).split('=');
      const d = definicoes[nome];
      if (!d) throw new ErroFlag(`unknown flag: --${nome}`);
      if (resto.length) atribuir(nome, resto.join('='), `--${nome}`);
      else if (d.tipo === 'bool') flags[nome] = true;
      else {
        if (i + 1 >= args.length) throw new ErroFlag(`flag needs an argument: --${nome}`);
        atribuir(nome, args[++i], `--${nome}`);
      }
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const curto = a[j];
        const nome = porCurto[curto];
        if (!nome) throw new ErroFlag(`unknown shorthand flag: '${curto}' in ${a}`);
        const d = definicoes[nome];
        if (d.tipo === 'bool') {
          if (a[j + 1] === '=') {
            flags[nome] = a.slice(j + 2) !== 'false';
            break;
          }
          flags[nome] = true;
          continue;
        }
        let valor = a.slice(j + 1);
        if (valor.startsWith('=')) valor = valor.slice(1);
        if (!valor) {
          if (i + 1 >= args.length) throw new ErroFlag(`flag needs an argument: '${curto}' in -${curto}`);
          valor = args[++i];
        }
        atribuir(nome, valor, `-${curto}, --${nome}`);
        break;
      }
    } else {
      posicionais.push(a);
    }
  }
  return { flags, posicionais, depois };
}

/** Distância de edição, para o "Did you mean this?". */
export function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
