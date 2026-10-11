import type { ConversionCoverage, PageCoverage } from '../api/types';

export function coverageSummary(coverage: ConversionCoverage): string {
  const classified = coverage.excludedPages !== undefined || coverage.pages.some(page => page.contentRole);
  if (!classified) return `${coverage.processedPages.length} de ${coverage.totalPages} páginas processadas`;
  const musical = coverage.pages.filter(page => page.contentRole === 'musical');
  const processed = musical.filter(page => page.status === 'processed').length;
  const excluded = coverage.excludedPages?.length ?? coverage.pages.filter(page => page.status === 'excluded').length;
  const uncertain = coverage.uncertainPages?.length ?? coverage.pages.filter(page => page.contentRole === 'uncertain').length;
  return [musical.length ? `${processed} de ${musical.length} ${musical.length === 1 ? "página musical identificada processada" : "páginas musicais identificadas processadas"}` : 'Nenhuma página musical identificada',
    `${coverage.totalPages} ${coverage.totalPages === 1 ? "página" : "páginas"} no documento`, excluded ? `${excluded} sem conteúdo musical, com exclusão conferida` : '',
    uncertain ? `${uncertain} com classificação a conferir` : ''].filter(Boolean).join(' · ');
}

export function coveragePageLabel(page: PageCoverage): string {
  if (page.status === 'excluded') return 'Sem conteúdo musical · exclusão conferida';
  if (page.supportStatus === 'unsupported') return 'Notação musical ainda não suportada';
  if (page.contentRole === 'uncertain') return `Classificação a conferir${page.status === 'missing' ? ' · leitura não concluída' : ' · prévia disponível'}`;
  return page.status === 'processed' ? 'Processada' : 'Ausente';
}
