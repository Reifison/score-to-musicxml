import { describe, expect, it } from 'vitest';
import { coveragePageLabel, coverageSummary } from './coveragePresentation.js';

describe('physical pages and musical coverage', () => {
  it('does not count a confirmed cover as missing music', () => {
    const summary=coverageSummary({totalPages:2,processedPages:[2],missingPages:[],excludedPages:[1],uncertainPages:[],pages:[
      {page:1,status:'excluded',contentRole:'nonmusical',parts:[]},{page:2,status:'processed',contentRole:'musical',parts:[]}
    ]});
    expect(summary).toContain('1 de 1 página musical identificada');
    expect(summary).toContain('2 páginas no documento');
    expect(summary).toContain('1 sem conteúdo musical');
    expect(summary).not.toContain('ausente');
  });
  it('keeps a successful but ambiguous page visible instead of claiming musical coverage', () => {
    expect(coverageSummary({totalPages:1,processedPages:[1],missingPages:[],excludedPages:[],uncertainPages:[1],pages:[{page:1,status:'processed',contentRole:'uncertain',parts:[]}]})).toContain('Nenhuma página musical identificada · 1 página no documento · 1 com classificação a conferir');
    expect(coveragePageLabel({page:1,status:'processed',contentRole:'uncertain',parts:[]})).toContain('prévia disponível');
  });
  it('distinguishes an unsupported musical page from excluded nonmusical material', () => {
    expect(coveragePageLabel({page:1,status:'missing',contentRole:'musical',supportStatus:'unsupported',parts:[]})).toBe('Notação musical ainda não suportada');
    expect(coveragePageLabel({page:2,status:'excluded',contentRole:'nonmusical',parts:[]})).toBe('Sem conteúdo musical · exclusão conferida');
  });
  it('preserves legacy coverage without inventing classification', () => {
    expect(coverageSummary({totalPages:3,processedPages:[1,3],missingPages:[2],pages:[]})).toBe('2 de 3 páginas processadas');
  });
});
