import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GameUtilsService {
  normalizarLetra(letra: string): string {
    return letra
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  normalizarParaComparar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizarPalabraSopa(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-ZÑ]/g, '');
  }

  generarVariantesToken(token: string): string[] {
    const variantes = new Set<string>([token]);

    if (token.length > 4 && token.endsWith('es')) {
      variantes.add(token.slice(0, -2));
    }
    if (token.length > 3 && token.endsWith('s')) {
      variantes.add(token.slice(0, -1));
    }

    const sufijosComunes = [
      'yendo', 'iendo', 'ando',
      'aciones', 'acion',
      'mente',
      'ados', 'adas', 'idos', 'idas',
      'ado', 'ada', 'ido', 'ida',
      'aron', 'ieron',
      'amos', 'emos', 'imos',
      'aran', 'eran', 'iran',
      'aran', 'eran',
      'ando', 'iendo',
      'aba', 'ada', 'ido',
      'ar', 'er', 'ir',
      'es', 'en', 'an',
      'as', 'os', 'a', 'e', 'o'
    ];

    for (const sufijo of sufijosComunes) {
      if (token.length > (sufijo.length + 3) && token.endsWith(sufijo)) {
        variantes.add(token.slice(0, -sufijo.length));
      }
    }

    return [...variantes].filter(v => v.length >= 3);
  }

  tokensRelacionados(tokenA: string, tokenB: string): boolean {
    if (tokenA === tokenB) return true;

    const variantesA = this.generarVariantesToken(tokenA);
    const variantesB = this.generarVariantesToken(tokenB);

    return variantesA.some(varA =>
      variantesB.some(varB => {
        if (varA === varB) return true;
        if (varA.length >= 4 && varB.startsWith(varA) && (varB.length - varA.length) <= 3) return true;
        if (varB.length >= 4 && varA.startsWith(varB) && (varA.length - varB.length) <= 3) return true;
        return false;
      })
    );
  }

  significadoIncluyeConcepto(concepto: string, significado: string): boolean {
    const conceptoNormalizado = this.normalizarParaComparar(concepto);
    const significadoNormalizado = this.normalizarParaComparar(significado);

    if (!conceptoNormalizado) return false;
    if (significadoNormalizado.includes(conceptoNormalizado)) {
      return true;
    }

    const tokensConcepto = conceptoNormalizado.split(' ').filter(t => t.length >= 4);
    const tokensSignificado = significadoNormalizado.split(' ').filter(t => t.length >= 4);

    return tokensConcepto.some(tokenConcepto =>
      tokensSignificado.some(tokenSignificado => this.tokensRelacionados(tokenConcepto, tokenSignificado))
    );
  }

  parsearKey(key: string): { fila: number; columna: number } | null {
    const [filaRaw, columnaRaw] = key.split('-');
    const fila = Number(filaRaw);
    const columna = Number(columnaRaw);
    if (!Number.isInteger(fila) || !Number.isInteger(columna)) return null;
    return { fila, columna };
  }
}
