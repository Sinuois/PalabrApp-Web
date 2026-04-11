import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TriviaGeografia {
  pregunta: string;
  opciones: string[];
  indiceCorrecto: number;
  datoExtra?: string;
}

type Region = {
  nombre: string;
  codigo: string;
  capital: string;
  comunas: string[];
};

type ItemConRegion = {
  nombre: string;
  region: string;
  datoExtra?: string;
};

type ItemConZona = {
  nombre: string;
  zona: string;
  datoExtra?: string;
};

type CategoriaClave =
  | 'volcan'
  | 'rio'
  | 'montana'
  | 'parque'
  | 'isla'
  | 'glaciar'
  | 'lago'
  | 'laguna'
  | 'ciudad_costera'
  | 'ciudad'
  | 'pueblo'
  | 'flora'
  | 'fauna';

type BancoGeografia = {
  regiones: Region[];
  volcanes: ItemConRegion[];
  rios: ItemConRegion[];
  montanas: ItemConRegion[];
  parquesNacionales: ItemConRegion[];
  islas: ItemConRegion[];
  glaciares: ItemConRegion[];
  lagos: ItemConRegion[];
  lagunas: ItemConRegion[];
  ciudadesCosteras: ItemConRegion[];
  ciudades: ItemConRegion[];
  pueblos: ItemConRegion[];
  floraNativa: ItemConZona[];
  faunaNativa: ItemConZona[];
  distractoresExternos: Record<CategoriaClave, string[]>;
};

@Injectable({ providedIn: 'root' })
export class GeografiaChileTriviaService {
  private http = inject(HttpClient);
  private banco: BancoGeografia | null = null;
  private cargaEnCurso: Promise<BancoGeografia> | null = null;
  private preguntasRecientes: string[] = [];
  private readonly maxPreguntasRecientes = 24;

  async generarPregunta(): Promise<TriviaGeografia | null> {
    const banco = await this.cargarBanco();

    const plantillas: Array<() => TriviaGeografia | null> = [
      () => this.generarComunaDeRegion(banco),
      () => this.generarNoComunaDeRegion(banco),
      () => this.generarCapitalRegion(banco),
      () => this.generarEsCategoriaConRegion('un volcán', banco.volcanes, 'volcan', banco),
      () => this.generarEsCategoriaConRegion('un río', banco.rios, 'rio', banco),
      () => this.generarEsCategoriaConRegion('una montaña importante', banco.montanas, 'montana', banco),
      () => this.generarEsCategoriaConRegion('un parque nacional', banco.parquesNacionales, 'parque', banco),
      () => this.generarEsCategoriaConRegion('una isla', banco.islas, 'isla', banco),
      () => this.generarEsCategoriaConRegion('un glaciar', banco.glaciares, 'glaciar', banco),
      () => this.generarEsCategoriaConRegion('un lago', banco.lagos, 'lago', banco),
      () => this.generarEsCategoriaConRegion('una laguna', banco.lagunas, 'laguna', banco),
      () => this.generarEsCategoriaConRegion('una ciudad costera', banco.ciudadesCosteras, 'ciudad_costera', banco),
      () => this.generarEsCategoriaConRegion('una ciudad', banco.ciudades, 'ciudad', banco),
      () => this.generarEsCategoriaConRegion('un pueblo', banco.pueblos, 'pueblo', banco),
      () => this.generarEsCategoriaConZona('una especie de flora nativa', banco.floraNativa, 'flora', banco),
      () => this.generarEsCategoriaConZona('una especie de fauna nativa', banco.faunaNativa, 'fauna', banco),
      () => this.generarElementoCategoriaPorRegion('un parque nacional', banco.parquesNacionales),
      () => this.generarElementoCategoriaPorRegion('una isla', banco.islas),
      () => this.generarElementoCategoriaPorRegion('un glaciar', banco.glaciares),
      () => this.generarElementoCategoriaPorRegion('una ciudad costera', banco.ciudadesCosteras),
      () => this.generarElementoCategoriaPorRegion('un lago', banco.lagos),
      () => this.generarZonaDeEspecie('flora nativa', banco.floraNativa),
      () => this.generarZonaDeEspecie('fauna nativa', banco.faunaNativa)
    ];

    let primerFallback: TriviaGeografia | null = null;

    for (let intento = 0; intento < 24; intento++) {
      const orden = this.barajar(plantillas);
      for (const plantilla of orden) {
        const reto = plantilla();
        if (!reto) continue;

        if (!primerFallback) {
          primerFallback = reto;
        }

        if (this.esPreguntaReciente(reto)) {
          continue;
        }

        this.registrarPreguntaReciente(reto);
        return reto;
      }
    }

    if (primerFallback) {
      this.registrarPreguntaReciente(primerFallback);
    }

    return primerFallback;
  }

  private async cargarBanco(): Promise<BancoGeografia> {
    if (this.banco) return this.banco;
    if (this.cargaEnCurso) return this.cargaEnCurso;

    this.cargaEnCurso = firstValueFrom(this.http.get('data/geografia-chile.txt', { responseType: 'text' }))
      .then((contenido) => {
        const parseado = this.parsearFuente(contenido);
        this.banco = parseado;
        return parseado;
      })
      .finally(() => {
        this.cargaEnCurso = null;
      });

    return this.cargaEnCurso;
  }

  private parsearFuente(contenido: string): BancoGeografia {
    const regiones = new Map<string, Region>();
    const banco: BancoGeografia = {
      regiones: [],
      volcanes: [],
      rios: [],
      montanas: [],
      parquesNacionales: [],
      islas: [],
      glaciares: [],
      lagos: [],
      lagunas: [],
      ciudadesCosteras: [],
      ciudades: [],
      pueblos: [],
      floraNativa: [],
      faunaNativa: [],
      distractoresExternos: {
        volcan: [],
        rio: [],
        montana: [],
        parque: [],
        isla: [],
        glaciar: [],
        lago: [],
        laguna: [],
        ciudad_costera: [],
        ciudad: [],
        pueblo: [],
        flora: [],
        fauna: []
      }
    };

    const lineas = contenido
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea && !linea.startsWith('#'));

    for (const linea of lineas) {
      const partes = linea.split('|').map((p) => p.trim());
      if (partes.length < 3) continue;

      if (partes[0] === 'R' && partes.length >= 4) {
        const nombre = partes[1];
        const codigo = partes[2];
        const capital = partes.length >= 5 ? partes[4] : partes[3];
        regiones.set(nombre, {
          nombre,
          codigo,
          capital,
          comunas: []
        });
      }

      if (partes[0] === 'C') {
        const [_, nombreRegion, comuna] = partes;
        const region = regiones.get(nombreRegion);
        if (!region) continue;
        if (!region.comunas.includes(comuna)) {
          region.comunas.push(comuna);
        }
      }

      if (partes[0] === 'V') this.agregarItemConRegion(banco.volcanes, partes);
      if (partes[0] === 'RI') this.agregarItemConRegion(banco.rios, partes);
      if (partes[0] === 'M') this.agregarItemConRegion(banco.montanas, partes);
      if (partes[0] === 'PN') this.agregarItemConRegion(banco.parquesNacionales, partes);
      if (partes[0] === 'IS') this.agregarItemConRegion(banco.islas, partes);
      if (partes[0] === 'GL') this.agregarItemConRegion(banco.glaciares, partes);
      if (partes[0] === 'L') this.agregarItemConRegion(banco.lagos, partes);
      if (partes[0] === 'LG') this.agregarItemConRegion(banco.lagunas, partes);
      if (partes[0] === 'CC') this.agregarItemConRegion(banco.ciudadesCosteras, partes);
      if (partes[0] === 'CI') this.agregarItemConRegion(banco.ciudades, partes);
      if (partes[0] === 'P') this.agregarItemConRegion(banco.pueblos, partes);
      if (partes[0] === 'FL') this.agregarItemConZona(banco.floraNativa, partes);
      if (partes[0] === 'FA') this.agregarItemConZona(banco.faunaNativa, partes);
      if (partes[0] === 'X') this.agregarDistractorExterno(banco, partes);
    }

    banco.regiones = [...regiones.values()].filter((r) => r.comunas.length > 0);
    return banco;
  }

  private agregarItemConRegion(destino: ItemConRegion[], partes: string[]): void {
    if (partes.length < 3) return;
    const nombre = partes[1];
    const region = partes[2] || 'Chile';
    const datoExtra = partes[3] || undefined;
    if (!nombre) return;
    if (!destino.some((it) => it.nombre === nombre && it.region === region)) {
      destino.push({ nombre, region, datoExtra });
    }
  }

  private agregarItemConZona(destino: ItemConZona[], partes: string[]): void {
    if (partes.length < 3) return;
    const nombre = partes[1];
    const zona = partes[2] || 'Chile';
    const datoExtra = partes[3] || undefined;
    if (!nombre) return;
    if (!destino.some((it) => it.nombre === nombre && it.zona === zona)) {
      destino.push({ nombre, zona, datoExtra });
    }
  }

  private agregarDistractorExterno(banco: BancoGeografia, partes: string[]): void {
    if (partes.length < 3) return;
    const categoria = partes[1] as CategoriaClave;
    const nombre = partes[2];
    const destino = banco.distractoresExternos[categoria];
    if (!destino || !nombre) return;
    if (!destino.includes(nombre)) {
      destino.push(nombre);
    }
  }

  private generarComunaDeRegion(banco: BancoGeografia): TriviaGeografia | null {
    const candidatas = banco.regiones.filter((r) => r.comunas.length >= 1);
    if (candidatas.length === 0) return null;

    const region = this.elegirUno(candidatas);
    if (!region) return null;

    const correcta = this.elegirUno(region.comunas);
    if (!correcta) return null;

    const otrasComunas = banco.regiones
      .filter((r) => r.nombre !== region.nombre)
      .flatMap((r) => r.comunas);
    const distractores = this.muestraDistinta(otrasComunas, 2);
    if (distractores.length < 2) return null;

    const opciones = this.barajar([correcta, ...distractores]);
    return {
      pregunta: `¿Cuál de las siguientes es una comuna de ${this.nombreRegionPregunta(region.nombre)}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta)
    };
  }

  private generarNoComunaDeRegion(banco: BancoGeografia): TriviaGeografia | null {
    const candidatas = banco.regiones.filter((r) => r.comunas.length >= 2);
    if (candidatas.length === 0) return null;

    const region = this.elegirUno(candidatas);
    if (!region) return null;

    const correctas = this.muestraDistinta(region.comunas, 2);
    if (correctas.length < 2) return null;

    const otrasComunas = banco.regiones
      .filter((r) => r.nombre !== region.nombre)
      .flatMap((r) => r.comunas);
    const incorrecta = this.elegirUno(otrasComunas.filter((c) => !correctas.includes(c)));
    if (!incorrecta) return null;

    const opciones = this.barajar([incorrecta, ...correctas]);
    return {
      pregunta: `¿Cuál de las siguientes NO es una comuna de ${this.nombreRegionPregunta(region.nombre)}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === incorrecta)
    };
  }

  private generarCapitalRegion(banco: BancoGeografia): TriviaGeografia | null {
    if (banco.regiones.length < 3) return null;

    const region = this.elegirUno(banco.regiones);
    if (!region) return null;

    const distractores = this.muestraDistinta(
      banco.regiones.filter((r) => r.nombre !== region.nombre).map((r) => r.capital),
      2
    );
    if (distractores.length < 2) return null;

    const opciones = this.barajar([region.capital, ...distractores]);
    return {
      pregunta: `¿Cuál es la capital de ${this.nombreRegionPregunta(region.nombre)}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === region.capital)
    };
  }

  private generarEsCategoriaConRegion(
    descriptorConArticulo: string,
    items: ItemConRegion[],
    categoria: CategoriaClave,
    banco: BancoGeografia
  ): TriviaGeografia | null {
    if (items.length < 1) return null;

    const correcta = this.elegirUno(items);
    if (!correcta) return null;

    const distractores = this.muestraDistinta(
      banco.distractoresExternos[categoria].filter((n) => n !== correcta.nombre),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.nombre, ...distractores]);
    return {
      pregunta: `¿Cuál de las siguientes opciones corresponde a ${descriptorConArticulo} de Chile?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.nombre),
      datoExtra: correcta.datoExtra
    };
  }

  private generarEsCategoriaConZona(
    descriptorConArticulo: string,
    items: ItemConZona[],
    categoria: CategoriaClave,
    banco: BancoGeografia
  ): TriviaGeografia | null {
    if (items.length < 1) return null;

    const correcta = this.elegirUno(items);
    if (!correcta) return null;

    const distractores = this.muestraDistinta(
      banco.distractoresExternos[categoria].filter((n) => n !== correcta.nombre),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta.nombre, ...distractores]);
    return {
      pregunta: `¿Cuál de las siguientes opciones corresponde a ${descriptorConArticulo} de Chile?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta.nombre),
      datoExtra: correcta.datoExtra
    };
  }

  private generarElementoCategoriaPorRegion(
    descriptorConArticulo: string,
    items: ItemConRegion[]
  ): TriviaGeografia | null {
    const regionesConElementos = new Map<string, string[]>();
    for (const it of items) {
      if (!regionesConElementos.has(it.region)) {
        regionesConElementos.set(it.region, []);
      }
      regionesConElementos.get(it.region)!.push(it.nombre);
    }

    const regionesValidas = [...regionesConElementos.entries()].filter(([, lista]) => lista.length > 0);
    if (regionesValidas.length < 2) return null;

    const seleccion = this.elegirUno(regionesValidas);
    if (!seleccion) return null;

    const [region, candidatos] = seleccion;
    const correcta = this.elegirUno(candidatos);
    if (!correcta) return null;

    const distractores = this.muestraDistinta(
      items
        .filter((it) => it.region !== region)
        .map((it) => it.nombre)
        .filter((nombre) => nombre !== correcta),
      3
    );
    if (distractores.length < 3) return null;

    const opciones = this.barajar([correcta, ...distractores]);
    const itemCorrecto = items.find((it) => it.nombre === correcta && it.region === region);
    return {
      pregunta: `¿Cuál de las siguientes opciones corresponde a ${descriptorConArticulo} de ${this.nombreRegionPregunta(region)}?`,
      opciones,
      indiceCorrecto: opciones.findIndex((op) => op === correcta),
      datoExtra: itemCorrecto?.datoExtra
    };
  }

  private nombreRegionPregunta(nombre: string): string {
    if (nombre.startsWith('Metropolitana')) {
      return `la Región ${nombre}`;
    }

    if (nombre.startsWith('Libertador ')) {
      return `la Región del ${nombre}`;
    }

    return `la Región de ${nombre}`;
  }

  private generarZonaDeEspecie(
    descriptor: 'flora nativa' | 'fauna nativa',
    items: ItemConZona[]
  ): TriviaGeografia | null {
    if (items.length < 4) return null;

    const objetivo = this.elegirUno(items);
    if (!objetivo) return null;

    const zonas = this.muestraDistinta(items.map((i) => i.zona), 4);
    if (zonas.length < 3) return null;

    const opcionesSet = new Set(zonas);
    opcionesSet.add(objetivo.zona);
    const opciones = this.barajar([...opcionesSet]).slice(0, 4);
    const indiceCorrecto = opciones.findIndex((op) => op === objetivo.zona);
    if (indiceCorrecto < 0) return null;

    return {
      pregunta: `¿En qué zona de Chile se asocia comúnmente la especie ${objetivo.nombre} como ${descriptor}?`,
      opciones,
      indiceCorrecto,
      datoExtra: objetivo.datoExtra
    };
  }

  private muestraDistinta<T>(items: T[], total: number): T[] {
    const unicos = [...new Set(items)];
    return this.barajar(unicos).slice(0, total);
  }

  private elegirUno<T>(items: T[]): T | null {
    if (items.length === 0) return null;
    return items[Math.floor(Math.random() * items.length)] ?? null;
  }

  private barajar<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
  }

  private esPreguntaReciente(reto: TriviaGeografia): boolean {
    const firma = this.firmaPregunta(reto);
    return this.preguntasRecientes.includes(firma);
  }

  private registrarPreguntaReciente(reto: TriviaGeografia): void {
    const firma = this.firmaPregunta(reto);
    this.preguntasRecientes.push(firma);
    if (this.preguntasRecientes.length > this.maxPreguntasRecientes) {
      this.preguntasRecientes.shift();
    }
  }

  private firmaPregunta(reto: TriviaGeografia): string {
    const correcta = reto.opciones[reto.indiceCorrecto] ?? '';
    return `${reto.pregunta.trim().toLowerCase()}|${correcta.trim().toLowerCase()}`;
  }
}
