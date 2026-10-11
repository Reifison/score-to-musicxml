import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";

export type PublicInfoPageKind = "support" | "privacy";

export function PublicInfoPage({ page }: { page: PublicInfoPageKind }) {
  return page === "support" ? <SupportPage /> : <PrivacyPage />;
}

function PageNavigation({ current }: { current: PublicInfoPageKind }) {
  return (
    <nav className="public-info-nav" aria-label="Páginas públicas">
      <a href="/" className="public-info-app-link"><ArrowLeft aria-hidden="true" size={17} /> Voltar ao Conversor</a>
      {current === "support" ? (
        <a href="/privacidade">Privacidade <ArrowRight aria-hidden="true" size={16} /></a>
      ) : (
        <a href="/suporte">Suporte <ArrowRight aria-hidden="true" size={16} /></a>
      )}
    </nav>
  );
}

function SupportPage() {
  return (
    <main className="public-info-page">
      <article className="public-info-card">
        <PageNavigation current="support" />
        <header>
          <span className="public-info-eyebrow">Conversor de Partituras</span>
          <h1>Suporte</h1>
          <p className="public-info-lead">Conte o que aconteceu e ajudaremos a conferir sua conversão, exportação ou conta.</p>
        </header>
        <section aria-labelledby="support-contact-title">
          <h2 id="support-contact-title">Fale com o suporte</h2>
          <p>Escreva para <a href="mailto:reifison@hotmail.com">reifison@hotmail.com</a>. Inclua o e-mail da conta, uma descrição do problema e o modelo do aparelho com a versão do iOS ou Android. Para conversões, informe se o arquivo enviado era uma foto, outra imagem ou PDF.</p>
          <p><strong>Não envie sua senha.</strong> Para uma compra que não aparece, tente primeiro a opção “Restaurar compra” no app.</p>
        </section>
        <section aria-labelledby="support-common-title">
          <h2 id="support-common-title">Problemas comuns</h2>
          <ul>
            <li><strong>Foto difícil de reconhecer:</strong> refaça com boa luz, a folha reta, sem sombras e sem cortar as margens.</li>
            <li><strong>PDF rejeitado:</strong> remova scripts, formulários ou conteúdo ativo do arquivo e tente enviá-lo novamente.</li>
            <li><strong>Notas ou ritmo incorretos:</strong> abra o MusicXML no MuseScore ou em outro editor de partituras e revise compassos, ritmo, clave e repetições.</li>
            <li><strong>Compra não aparece:</strong> use “Restaurar compra” na tela de compra do app.</li>
          </ul>
        </section>
        <section aria-labelledby="support-formats-title">
          <h2 id="support-formats-title">MusicXML e MIDI</h2>
          <p>Use MusicXML para revisar e editar a notação. Ele mantém informações de compassos, vozes, articulações e estrutura de página. Use MIDI para ouvir as notas ou levá-las a um sequenciador; a aparência da partitura pode mudar ao importar esse formato.</p>
          <p>O reconhecimento é automático. Se faltarem páginas, o resultado parcial identifica as páginas ausentes e permite visualizar e baixar o MusicXML; reprodução e MIDI ficam indisponíveis.</p>
          <p>Quando o arquivo não informa o andamento, o player assume 70 BPM. O timbre digital serve como referência de notas e ritmo, e pode soar diferente de um instrumento real ou de outro app.</p>
          <p>O player do aplicativo precisa de internet para abrir e preparar seus recursos. O MusicXML em cache não garante reprodução offline; você pode exportar o arquivo para outro app compatível.</p>
        </section>
        <section className="public-info-callout" aria-labelledby="support-privacy-title">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <h2 id="support-privacy-title">Proteja seus dados</h2>
            <p>Não envie senha, token, cookie ou o conteúdo completo do MusicXML por e-mail. Para pedir exclusão completa da conta ou de dados associados, escreva ao suporte.</p>
          </div>
        </section>
        <PageNavigation current="support" />
      </article>
    </main>
  );
}

function PrivacyPage() {
  return (
    <main className="public-info-page">
      <article className="public-info-card">
        <PageNavigation current="privacy" />
        <header>
          <span className="public-info-eyebrow">Conversor de Partituras</span>
          <h1>Política de Privacidade</h1>
          <p className="public-info-lead">Última atualização: 6 de outubro de 2026.</p>
        </header>
        <p>O Conversor de Partituras transforma arquivos enviados em MusicXML, permite exportar MIDI e oferece visualização e reprodução da partitura.</p>
        <section aria-labelledby="privacy-data-title">
          <h2 id="privacy-data-title">Dados que tratamos</h2>
          <ul>
            <li><strong>Conta:</strong> nome, e-mail e senha protegida por hash.</li>
            <li><strong>Partituras:</strong> arquivos enviados, como fotos, imagens e PDFs, e os arquivos MusicXML gerados. O MIDI é gerado quando você solicita a exportação.</li>
            <li><strong>Uso do serviço:</strong> quantidade de conversões gratuitas usadas, estados de conversão e registros de auditoria.</li>
            <li><strong>Diagnóstico do MIDI:</strong> fase, resultado, duração, tamanho do arquivo quando a exportação funciona e código seguro de erro quando falha. Não registramos o conteúdo da partitura, o MIDI em base64 nem credenciais nesse diagnóstico.</li>
            <li><strong>Compras:</strong> identificadores de transação da App Store ou tokens de compra do Google Play, produto comprado e eventos de restauração ou revogação.</li>
            <li><strong>Dados técnicos:</strong> endereço IP e metadados básicos de requisições para segurança e auditoria.</li>
          </ul>
        </section>
        <section aria-labelledby="privacy-use-title">
          <h2 id="privacy-use-title">Como usamos os dados</h2>
          <p>Usamos esses dados para autenticar sua conta, receber e processar arquivos, gerar MusicXML e MIDI, mostrar e reproduzir partituras, aplicar o limite gratuito de três conversões, liberar recursos comprados, prevenir abuso, investigar falhas e responder a pedidos de suporte.</p>
        </section>
        <section aria-labelledby="privacy-files-title">
          <h2 id="privacy-files-title">Arquivos enviados</h2>
          <p>Quando viável, as imagens são reencodadas no servidor para remover metadados sensíveis, incluindo dados EXIF de localização. PDFs com conteúdo ativo suspeito podem ser rejeitados. Arquivos maliciosos ou acima do limite aceito não são processados.</p>
        </section>
        <section aria-labelledby="privacy-retention-title">
          <h2 id="privacy-retention-title">Retenção e exclusão</h2>
          <p>Você pode mover uma partitura para a lixeira e restaurá-la durante sete dias. Depois desse prazo, a limpeza remove o arquivo original, os MusicXML das tentativas e o registro da partitura. A limpeza administrativa também pode remover partituras e registros de auditoria antigos conforme os períodos configurados.</p>
          <p>O servidor gera MIDI em memória a partir do MusicXML quando você solicita a exportação, sem guardar um arquivo MIDI permanente. No app, o player mantém uma cópia local do MusicXML associada à conta e à revisão do resultado. A reutilização expira depois de sete dias sem abertura; a verificação e remoção acontecem quando o cache é acessado. A cópia pode permanecer no armazenamento do app até a limpeza ou remoção do app, e esse cache não garante acesso ao player sem internet. No navegador, os dados do player ficam na memória da página durante a sessão.</p>
          <p>Um MIDI exportado pode permanecer no cache local do app até ser substituído ou removido pelo sistema. Cópias que você salva em Arquivos, MuseScore ou outro app seguem as regras daquele destino.</p>
        </section>
        <section aria-labelledby="privacy-sharing-title">
          <h2 id="privacy-sharing-title">Compartilhamento</h2>
          <p>Não vendemos dados pessoais. Compartilhamos dados com provedores necessários para operar o serviço, como hospedagem, banco de dados, fila de processamento e os serviços da Apple e do Google usados nas compras. Quando você exporta um arquivo para outro app, o envio acontece por sua ação e o destino passa a tratar a cópia conforme suas próprias regras.</p>
        </section>
        <section aria-labelledby="privacy-security-title">
          <h2 id="privacy-security-title">Segurança</h2>
          <p>O serviço usa identificadores aleatórios, validação do tipo real dos arquivos, acesso ao banco de dados por Prisma, cookies ou tokens seguros, limitação de requisições e registros de auditoria. As compras Apple são validadas no servidor quando essa configuração está disponível.</p>
        </section>
        <section aria-labelledby="privacy-contact-title">
          <h2 id="privacy-contact-title">Contato e pedidos</h2>
          <p>Para questões de privacidade, suporte ou exclusão da conta e de dados associados, escreva para <a href="mailto:reifison@hotmail.com">reifison@hotmail.com</a>.</p>
        </section>
        <PageNavigation current="privacy" />
      </article>
    </main>
  );
}
