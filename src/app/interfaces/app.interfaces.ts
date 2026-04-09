export interface Palabra {
    _id:         string;
    concepto:    string;
    significado: string;
}

export interface PalabrasResponse {
    mostrando: number;
    total:     number;
    palabras:  Palabra[];
}