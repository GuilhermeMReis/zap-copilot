# Prints do site

`demo.html` é uma réplica do WhatsApp Web com uma conversa fictícia e o painel real (`src/panel.css`).
`options-demo.html` é a tela de Configurações real com uma API do Chrome simulada.

Para refazer os prints de `site/assets/shots/`, sirva a raiz do repositório e use o Chrome headless:

```bash
python3 -m http.server 8765
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1440,860 \
  --screenshot=conversa.png "http://127.0.0.1:8765/scripts/shots/demo.html?view=conversa"
```

Vistas: `conversa`, `auto`, `agenda`, `toast`.
