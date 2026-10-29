import type { ConversionCoverage, PageCoverage } from '../api/types';
import { t } from '../i18n';

export function coverageSummary(coverage: ConversionCoverage): string {
  const classified = coverage.excludedPages !== undefined || coverage.pages.some(page => page.contentRole);
  if (!classified) return t('{{processed}} de {{total}} páginas processadas', '{{processed}} of {{total}} pages processed', { processed: coverage.processedPages.length, total: coverage.totalPages });
  const musical = coverage.pages.filter(page => page.contentRole === 'musical');
  const processed = musical.filter(page => page.status === 'processed').length;
  const excluded = coverage.excludedPages?.length ?? coverage.pages.filter(page => page.status === 'excluded').length;
  const uncertain = coverage.uncertainPages?.length ?? coverage.pages.filter(page => page.contentRole === 'uncertain').length;
  return [musical.length ? t(musical.length === 1 ? '{{processed}} de {{total}} página musical identificada processada' : '{{processed}} de {{total}} páginas musicais identificadas processadas', musical.length === 1 ? '{{processed}} of {{total}} identified music page processed' : '{{processed}} of {{total}} identified music pages processed', { processed, total: musical.length }) : t('Nenhuma página musical identificada', 'No music pages identified'),
    t(coverage.totalPages === 1 ? '{{total}} página no documento' : '{{total}} páginas no documento', coverage.totalPages === 1 ? '{{total}} page in the document' : '{{total}} pages in the document', { total: coverage.totalPages }),
    excluded ? t('{{count}} sem conteúdo musical, com exclusão conferida', '{{count}} without musical content, exclusion checked', { count: excluded }) : '',
    uncertain ? t('{{count}} com classificação a conferir', '{{count}} with classification to review', { count: uncertain }) : ''].filter(Boolean).join(' · ');
}

export function coveragePageLabel(page: PageCoverage): string {
  if (page.status === 'excluded') return t('Sem conteúdo musical · exclusão conferida', 'No musical content · exclusion checked');
  if (page.supportStatus === 'unsupported') return t('Notação musical ainda não suportada', 'Musical notation not yet supported');
  if (page.contentRole === 'uncertain') return t('Classificação a conferir', 'Classification to review') + (page.status === 'missing' ? t(' · leitura não concluída', ' · recognition incomplete') : t(' · prévia disponível', ' · preview available'));
  return page.status === 'processed' ? t('Processada', 'Processed') : t('Ausente', 'Missing');
}
