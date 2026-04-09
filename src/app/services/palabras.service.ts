import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Palabra, PalabrasResponse } from '../interfaces/app.interfaces';

const BASE_URL = 'https://palabrapp-backend-production.up.railway.app/api';

export type Orden = 'New' | 'Abc' | 'Zyx';

interface WikipediaSummaryResponse {
  extract?: string;
}

interface WikcionarioPage {
  extract?: string;
}

interface WikcionarioQueryResponse {
  query?: {
    pages?: Record<string, WikcionarioPage>;
  };
}

@Injectable({ providedIn: 'root' })
export class PalabrasService {

  private _palabras = signal<Palabra[]>([]);
  private _cargado  = signal(false);

  readonly palabras  = this._palabras.asReadonly();
  readonly cargado   = this._cargado.asReadonly();
  readonly cantPalabras = computed(() => this._palabras().length);

  readonly orden = signal<Orden>('Abc');

  readonly palabrasOrdenadas = computed<Palabra[]>(() => {
    const lista = [...this._palabras()];
    switch (this.orden()) {
      case 'Abc': return lista.sort((a, b) => a.concepto.localeCompare(b.concepto));
      case 'Zyx': return lista.sort((a, b) => b.concepto.localeCompare(a.concepto));
      default:    return lista;
    }
  });

  constructor(private http: HttpClient) {
    this.cargarPalabras();
  }

  private esErrorConceptoEliminado(err: any): boolean {
    const backendMsg = String(err?.error?.msg ?? '').toLowerCase();
    const localMsg = String(err?.message ?? '').toLowerCase();
    return err?.status === 404
      || backendMsg.includes('no existe')
      || backendMsg.includes('no encontrado')
      || backendMsg.includes('eliminad')
      || localMsg.includes('not found');
  }

  async cargarPalabras(): Promise<void> {
    const resp = await firstValueFrom(
      this.http.get<PalabrasResponse>(`${BASE_URL}/palabras`)
    );
    this._palabras.set([...resp.palabras].reverse());
    this._cargado.set(true);
  }

  async getPalabra(id: string): Promise<Palabra> {
    // Look up from already-loaded list to avoid partial API response
    const fromList = this._palabras().find(p => p._id === id);
    if (fromList) return fromList;
    if (!this._cargado()) await this.cargarPalabras();
    const found = this._palabras().find(p => p._id === id);
    if (found) return found;
    throw new Error('Concepto no encontrado');
  }

  async crearPalabra(concepto: string, significado: string): Promise<Palabra> {
    let palabraFiltrada = concepto.trim();
    palabraFiltrada = palabraFiltrada[0].toUpperCase() + palabraFiltrada.slice(1);
    const resp = await firstValueFrom(
      this.http.post<{ msg: string; palabra: Palabra }>(`${BASE_URL}/palabras`, { concepto: palabraFiltrada, significado })
    );
    return resp.palabra;
  }

  async actualizarPalabra(id: string, significado: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.put<{ msg: string }>(`${BASE_URL}/palabras/${id}`, { significado })
      );
    } catch (err: any) {
      if (this.esErrorConceptoEliminado(err)) {
        throw new Error('CONCEPTO_ELIMINADO');
      }
      throw err;
    }
  }

  async eliminarPalabra(id: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete<{ msg: string }>(`${BASE_URL}/palabras/${id}`)
      );
    } catch (err: any) {
      if (this.esErrorConceptoEliminado(err)) {
        throw new Error('CONCEPTO_ELIMINADO');
      }
      throw err;
    }
  }

  async buscarDefinicion(concepto: string): Promise<string | null> {
    const termino = concepto.trim();
    if (!termino) return null;

    const variantes = this.generarTerminosConsulta(termino);
    let mejorDefinicionCorta: string | null = null;

    for (const variante of variantes) {
      const definicionWikcionario = await this.buscarEnWikcionario(variante);
      if (!definicionWikcionario) continue;

      if (!this.esDefinicionEscueta(definicionWikcionario)) {
        return this.hacerDefinicionSimple(definicionWikcionario);
      }

      if (!mejorDefinicionCorta) {
        mejorDefinicionCorta = definicionWikcionario;
      }
    }

    for (const variante of variantes) {
      const definicionWikipedia = await this.buscarEnWikipedia(variante);
      if (!definicionWikipedia) continue;

      if (!this.esDefinicionEscueta(definicionWikipedia)) {
        return this.hacerDefinicionSimple(definicionWikipedia);
      }

      if (!mejorDefinicionCorta) {
        mejorDefinicionCorta = definicionWikipedia;
      }
    }

    // Si no hay una definición larga, usa la mejor opción corta encontrada.
    if (mejorDefinicionCorta) {
      return this.hacerDefinicionSimple(mejorDefinicionCorta);
    }

    return null;
  }

  private esDefinicionEscueta(definicion: string): boolean {
    const texto = definicion.trim();

    if (texto.length < 50) return true;
    if (this.esDefinicionNoConfiable(texto)) return true;

    return this.esTextoEtimologico(texto);
  }

  private esDefinicionNoConfiable(texto: string): boolean {
    const t = texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (t.endsWith(':')) return true;

    return t.includes('hace referencia a varios articulos')
      || t.includes('puede referirse a:')
      || t.includes('puede hacer referencia a:')
      || t.includes('termino') && t.includes('hace referencia a');
  }

  private esTextoEtimologico(texto: string): boolean {
    const t = texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const mencionaOrigen =
      t.includes('etimolog')
      || t.includes('sufijo')
      || t.includes('prefijo')
      || t.includes('deriva de')
      || t.includes('del latin')
      || t.includes('del griego')
      || t.includes('del arabe')
      || t.includes('del arameo')
      || t.includes('protosemita')
      || t.includes('del frances');

    const arrancaComoEtimologia =
      t.startsWith('de ')
      || t.startsWith('del ')
      || t.startsWith('deriva de ')
      || t.startsWith('procede de ');

    return arrancaComoEtimologia && mencionaOrigen;
  }

  private limpiarDefinicionResultado(texto: string): string {
    return texto
      .replace(/\[(\d+)\]/g, '')
      .replace(/(\p{L})(\d+)(?=[\s.,;:!?)]|$)/gu, '$1')
      .replace(/\s*\d+\.\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private hacerDefinicionSimple(texto: string): string {
    const limpio = this.limpiarDefinicionResultado(texto);
    if (!limpio) return '';

    const primeraOracion = limpio.match(/^[^.?!]+[.?!]/)?.[0]?.trim();
    return primeraOracion || limpio;
  }

  private puntuarDefinicionSimple(texto: string): number {
    const t = this.limpiarDefinicionResultado(texto);
    if (!t) return Number.NEGATIVE_INFINITY;

    const len = t.length;
    // Centro ideal de longitud para una definición clara y simple.
    let score = 100 - Math.abs(len - 80) * 0.45;

    const comas = (t.match(/,/g) ?? []).length;
    const parentesis = (t.match(/[()]/g) ?? []).length;
    const dosPuntos = (t.match(/:/g) ?? []).length;
    const puntoYComa = (t.match(/;/g) ?? []).length;

    score -= comas * 3;
    score -= parentesis * 2;
    score -= dosPuntos * 4;
    score -= puntoYComa * 4;

    return score;
  }

  private generarVariantesBusqueda(termino: string): string[] {
    const limpio = termino.replace(/\s+/g, ' ').trim();
    if (!limpio) return [];

    const minusculas = limpio.toLowerCase();
    const capitalizarPrimera = limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
    const titleCase = limpio
      .toLowerCase()
      .replace(/\b\p{L}/gu, (letra) => letra.toUpperCase());

    const variantesBase = [limpio, minusculas, capitalizarPrimera, titleCase];
    const variantesConTilde = variantesBase.flatMap(v => this.generarVariantesConTilde(v));

    return Array.from(new Set([...variantesBase, ...variantesConTilde]));
  }

  private generarVariantesConTilde(texto: string): string[] {
    // Mantiene bajo el costo de red: aplica solo a una palabra sin tildes.
    if (!texto || texto.includes(' ')) return [];
    if (/[áéíóúÁÉÍÓÚ]/.test(texto)) return [];

    const chars = [...texto];
    const vocales = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']);
    const acentos: Record<string, string> = {
      a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú',
      A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú'
    };

    const indicesVocales: number[] = [];
    for (let i = 0; i < chars.length; i++) {
      if (vocales.has(chars[i])) indicesVocales.push(i);
    }

    if (indicesVocales.length === 0) return [];

    const variantes: string[] = [];
    for (let i = indicesVocales.length - 1; i >= 0; i--) {
      const idx = indicesVocales[i];
      const c = chars[idx];
      const acentuada = acentos[c];
      if (!acentuada) continue;

      const copia = [...chars];
      copia[idx] = acentuada;
      variantes.push(copia.join(''));

      // Limita variantes para evitar muchas consultas por término.
      if (variantes.length >= 3) break;
    }

    return variantes;
  }

  private generarTerminosConsulta(termino: string): string[] {
    const variantes = this.generarVariantesBusqueda(termino);
    const limpio = termino.replace(/\s+/g, ' ').trim();

    // Para verbos pronominales (ej. "hundirse"), consulta tambien el infinitivo base.
    if (limpio.toLowerCase().endsWith('se') && limpio.length > 4) {
      const base = limpio.slice(0, -2).trim();
      variantes.push(...this.generarVariantesBusqueda(base));
    }

    return Array.from(new Set(variantes));
  }

  private async buscarEnWikipedia(concepto: string): Promise<string | null> {
    try {
      const result = await firstValueFrom(
        this.http.get<WikipediaSummaryResponse>(
          `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(concepto)}`
        )
      );

      const extract = result.extract?.trim();
      if (!extract) return null;

      const candidata = extract.match(/^[^.]+\.[^\d]*/)?.[0]?.trim() ?? extract;
      const limpia = this.limpiarDefinicionResultado(candidata);
      return limpia || null;
    } catch {
      return null;
    }
  }

  private async buscarEnWikcionario(concepto: string): Promise<string | null> {
    try {
      const result = await firstValueFrom(
        this.http.get<WikcionarioQueryResponse>(
          `https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(concepto)}&format=json&origin=*`
        )
      );

      const pages = result.query?.pages;
      if (!pages) return null;

      const page = Object.values(pages)[0];
      const extract = page?.extract?.trim();
      if (!extract) return null;

      const lineas = extract
        .split('\n')
        .map(linea => linea.trim())
        .filter(linea => linea.length > 0 && !linea.startsWith('=='));

      const esMeta = (linea: string): boolean => {
        const l = linea.toLowerCase();
        return l.startsWith('etimolog')
          || l.startsWith('pronunci')
          || l.startsWith('sinónim')
          || l.startsWith('sinonim')
          || l.startsWith('antónim')
          || l.startsWith('antonim')
          || l.startsWith('traduccion')
          || l.startsWith('traducción')
          || l.startsWith('véase')
          || l.startsWith('ver también')
          || l.startsWith('uso:');
      };

      const esLineaEtimologica = (linea: string): boolean => {
        return this.esTextoEtimologico(linea);
      };

      const esLineaMorfologica = (linea: string): boolean => {
        const l = linea.toLowerCase();
        return l.includes('¦')
          || l.includes('plural:')
          || l.includes('singular:')
          || l.includes('femenino:')
          || l.includes('masculino:')
          || l.includes('invariante')
          || l.includes('participio de ')
          || l.includes('gerundio de ')
            || l.includes('pretérito de ')
            || l.includes('preterito de ');
      };

      const esLineaEncabezadoLema = (linea: string): boolean => {
        const normalizar = (s: string): string =>
          s
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s\u00a0]+/g, ' ')
            .trim();

        const l = normalizar(linea);
        const c = normalizar(concepto);
        if (!c) return false;

        if (l === c) return true;
        if (!l.startsWith(c)) return false;
        if (!linea.includes('(') || !linea.includes(')')) return false;

        // Descarta encabezados tipo "casus belli (invariante)".
        return l.length <= c.length + 30;
      };

      const esLineaPlaceholder = (linea: string): boolean => {
        const l = linea
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        return l.includes('si puedes, incorporala')
          || l.includes('ver como')
          || l.includes('...')
          || l.includes('(uso pronominal de ...)');
      };

      const candidatas = lineas
        .map(linea => linea.replace(/^\d+[\.)\-:]?\s+/, '').trim())
        .filter(linea =>
          linea.length > 2
          && !esMeta(linea)
          && !esLineaEtimologica(linea)
          && !esLineaMorfologica(linea)
          && !esLineaEncabezadoLema(linea)
          && !esLineaPlaceholder(linea)
        );

      let definicion = '';
      if (candidatas.length > 0) {
        definicion = [...candidatas].sort(
          (a, b) => this.puntuarDefinicionSimple(b) - this.puntuarDefinicionSimple(a)
        )[0];
      }

      const limpia = definicion ? this.limpiarDefinicionResultado(definicion) : '';
      return limpia || null;
    } catch {
      return null;
    }
  }
}