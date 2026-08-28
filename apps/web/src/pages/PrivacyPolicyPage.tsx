import "./privacy-policy.css";

const updatedAt = "27 de agosto de 2026";

export function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <img src="/brand-icon.png" alt="" />
          <div>
            <p className="legal-eyebrow">Conversor de Partituras</p>
            <h1>Política de Privacidade</h1>
            <p>Última atualização: {updatedAt}</p>
          </div>
        </header>

        <p>
          Esta Política explica como o Conversor de Partituras trata dados pessoais e arquivos para converter
          partituras em MusicXML, gerar MIDI e reproduzir a partitura no aplicativo e no site.
        </p>

        <section>
          <h2>Dados que tratamos</h2>
          <ul>
            <li><strong>Dados da conta:</strong> nome, e-mail, senha armazenada em formato protegido por hash e dados necessários para autenticação.</li>
            <li><strong>Arquivos enviados:</strong> fotos, imagens e PDFs de partituras escolhidos por você.</li>
            <li><strong>Arquivos gerados:</strong> MusicXML da conversão e MIDI gerado quando solicitado.</li>
            <li><strong>Uso e diagnóstico:</strong> quantidade de conversões, status, duração, tamanho do arquivo gerado, IP e registros técnicos de segurança. Os diagnósticos de MIDI não registram o conteúdo da partitura, MIDI em base64 ou credenciais.</li>
            <li><strong>Compras:</strong> produto adquirido, identificadores de transação e eventos de restauração, cancelamento ou revogação comunicados pela Apple ou Google Play.</li>
          </ul>
        </section>

        <section>
          <h2>Como usamos os dados</h2>
          <p>
            Usamos esses dados para autenticar sua conta, processar a conversão, exibir e reproduzir a partitura,
            permitir exportações, aplicar o limite de duas conversões gratuitas por conta, liberar a compra única de conversões
            ilimitadas, restaurar compras, prevenir abuso e prestar suporte.
          </p>
          <p>
            Imagens podem ser reencodadas para reduzir metadados, como EXIF de localização, quando isso for viável.
            Arquivos maliciosos, incompatíveis ou acima dos limites técnicos podem ser rejeitados.
          </p>
        </section>

        <section>
          <h2>Armazenamento e exclusão</h2>
          <p>
            Os arquivos enviados e o MusicXML resultante ficam disponíveis na sua conta para que você possa acessá-los.
            Você pode excluir uma partitura pelo aplicativo; ela permanece na lixeira por até 7 dias antes da eliminação
            definitiva. Partituras antigas podem ser removidas automaticamente conforme a política operacional do serviço,
            normalmente em até 365 dias. Registros de segurança e auditoria podem ser mantidos por até 730 dias, e arquivos
            temporários usados no processamento são limpos periodicamente. O MIDI é gerado sob demanda e não é mantido como
            arquivo permanente pelo serviço; uma cópia exportada para outro app ou para Arquivos passa a seguir as regras
            desse destino.
          </p>
        </section>

        <section>
          <h2>Compartilhamento</h2>
          <p>
            Não vendemos dados pessoais. Compartilhamos apenas o mínimo necessário com fornecedores que operam a
            infraestrutura, o armazenamento, o processamento e a segurança do serviço, além da Apple e do Google Play
            para processar compras dentro do app. Quando você exporta um arquivo para outro aplicativo, o compartilhamento
            ocorre por sua ação e o destino passa a ser responsável pelo tratamento posterior.
          </p>
        </section>

        <section>
          <h2>Compras dentro do app</h2>
          <p>
            O desbloqueio de conversões ilimitadas é uma compra única processada pela Apple App Store ou Google Play,
            conforme a plataforma. Usamos os identificadores técnicos recebidos para validar, restaurar e associar o
            benefício à conta. O acesso pode ser removido se a compra for reembolsada ou revogada pela loja.
          </p>
        </section>

        <section>
          <h2>Segurança</h2>
          <p>
            Aplicamos controles técnicos e organizacionais para reduzir riscos, incluindo autenticação, validação de
            arquivos, limitação de requisições e registros de auditoria. Nenhuma medida de segurança elimina todos os riscos.
          </p>
        </section>

        <section>
          <h2>Seus direitos e contato</h2>
          <p>
            Você pode solicitar acesso, correção ou exclusão da sua conta e dos seus dados, observadas as obrigações legais
            e os registros que precisem ser mantidos. Para tirar dúvidas, solicitar suporte ou exercer esses direitos,
            escreva para {" "}<a href="mailto:contato@nossateoria.com.br">contato@nossateoria.com.br</a>.
          </p>
        </section>

        <p className="legal-footer">Nossa Teoria · Conversor de Partituras</p>
      </article>
    </main>
  );
}
