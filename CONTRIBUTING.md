# Como contribuir

Contribuições são bem-vindas! O fluxo é por Pull Request:

1. Faça um **fork** do repositório e crie uma branch (`git checkout -b minha-melhoria`).
2. Carregue a pasta no Chrome em modo desenvolvedor e teste no WhatsApp Web.
   Use a aba de teste da página de Configurações para validar mudanças nos prompts.
3. Abra um **Pull Request** para a `main` explicando o que mudou e como testou.

## Regras

- A `main` é protegida: nada entra sem PR e sem a aprovação do mantenedor (@GuilhermeMReis).
- Workflows de PRs de contribuidores externos só rodam depois de aprovados pelo mantenedor.
- O site [zap.mavra.app](https://zap.mavra.app) é publicado automaticamente quando um PR que mexe em `site/` é mergeado.
- **Nunca** inclua chaves de API, tokens ou senhas em commits, prints ou issues.

## Onde mexer

- Leitura do WhatsApp Web (seletores): objeto `SEL` no topo de `src/content.js`
- Comportamento da IA: `src/prompts.js`
- Painel: `src/content.js` + `src/panel.css`
