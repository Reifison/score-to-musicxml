import "./privacy-policy.css";

export function SupportPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <header className="legal-header">
          <img src="/brand-icon.png" alt="" />
          <div>
            <p className="legal-eyebrow">Conversor de Partituras</p>
            <h1>Suporte</h1>
            <p>Estamos aqui para ajudar com suas partituras.</p>
          </div>
        </header>

        <section>
          <h2>Como podemos ajudar</h2>
          <p>
            Envie sua dúvida para <a href="mailto:contato@nossateoria.com.br">contato@nossateoria.com.br</a>. Respondemos a
            questões sobre conversão de imagens e PDFs, MusicXML, reprodução, exportação de MIDI, compras e restauração de compras.
          </p>
        </section>

        <section>
          <h2>Ao pedir ajuda</h2>
          <p>
            Informe a plataforma usada, o que estava tentando fazer e uma descrição do problema. Não envie senha, dados de pagamento
            nem uma partitura com informações pessoais, a menos que isso seja indispensável para o atendimento.
          </p>
        </section>

        <section>
          <h2>Conta, dados e compras</h2>
          <p>
            Para solicitar acesso, correção ou exclusão dos seus dados, escreva para o mesmo endereço. Compras são processadas pela
            Apple App Store ou pelo Google Play; também ajudamos a orientar a restauração de uma compra já realizada.
          </p>
        </section>

        <section>
          <h2>Privacidade</h2>
          <p>
            Consulte a <a href="/privacidade">Política de Privacidade</a> para entender como o Conversor de Partituras trata dados e
            arquivos.
          </p>
        </section>

        <p className="legal-footer">Nossa Teoria · Conversor de Partituras</p>
      </article>
    </main>
  );
}
