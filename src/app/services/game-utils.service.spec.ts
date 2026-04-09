import { GameUtilsService } from './game-utils.service';

describe('GameUtilsService', () => {
  let service: GameUtilsService;

  beforeEach(() => {
    service = new GameUtilsService();
  });

  it('preserva la ñ en la palabra de sopa', () => {
    expect(service.normalizarPalabraSopa('poruña')).toBe('PORUÑA');
  });

  it('preserva la ñ al normalizar letras', () => {
    expect(service.normalizarLetra('ñ')).toBe('Ñ');
  });

  it('sigue removiendo tildes normales', () => {
    expect(service.normalizarPalabraSopa('camión')).toBe('CAMION');
    expect(service.normalizarLetra('á')).toBe('A');
  });
});