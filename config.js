// Configuração do funil interativo. É o arquivo que se edita à mão antes de publicar.
window.CONFIG = {
  // Foto do Henrique (fica em site/midia/).
  AVATAR_URL: "midia/henrique-avatar.jpg",

  // Link do checkout do VIP na Hub.la (o padrão, sem order bump). O teste "orderbump-v1" abaixo troca o link por versão.
  // Vazio = botão mostra um aviso.
  LINK_CHECKOUT: "https://pay.hub.la/Muxrk9khr04JS10t58pm",
  CUPOM: "BOASVINDAS",
  // WhatsApp do atendimento: aparece como "Falar com um atendente" na lista de dúvidas do fim. Vazio = não aparece.
  LINK_ATENDENTE: "https://api.whatsapp.com/send/?phone=553182671759&text=Estou+com+d%C3%BAvidas+sobre+o+VIP&type=phone",

  // Áudios e vídeos do Henrique. Vazio = o trecho não aparece (no modo teste, aparece um aviso no lugar).
  // Áudio: .mp3 ou .m4a. Vídeo: .mp4 vertical (9:16). Pode ser caminho relativo (midia/boas-vindas.mp3) ou URL.
  MIDIA: {
    audioBoasVindas: "",   // depois do "Fala, viajante!": quem é ele e o que a pessoa vai descobrir
    audioResultado: "",    // logo depois do resultado: o que esse número significa
    videoHistoria: "",     // a viagem pra Paris pela metade do preço
    audioOferta: "",       // antes do cupom: por que entrar hoje
  },

  // Depoimentos em vídeo no vturb (ConverteAI). id = o "vid-..." do código do player; script = o player.js do mesmo código.
  VTURB: {
    renata: {
      id: "vid-6ad40e0ba884ed0eb81215af",
      script: "https://scripts.converteai.net/00c8b9a1-000b-422f-abff-cb49b5ef54fa/players/6ad40e0ba884ed0eb81215af/v4/player.js",
    },
  },

  // Imagens do fluxo da DataCrazy, copiadas pra site/midia/fluxo/ (comprimidas em 800 px) pra não depender do CDN deles.
  IMAGENS: {
    tarifaAward: "midia/fluxo/tarifaAward.jpg",
    googleParis: "midia/fluxo/googleParis.jpg",
    pagouParis: "midia/fluxo/pagouParis.jpg",
    viagemParis: "midia/fluxo/viagemParis.jpg",
    carlosSantiago: "midia/fluxo/carlosSantiago.jpg",
    julianaEgito: "midia/fluxo/julianaEgito.jpg",
    comoAplicarCupom: "midia/fluxo/comoAplicarCupom.jpg",
  },

  // Promoção no fim do funil (o "print" do WhatsApp com a promoção pro destino da pessoa).
  //   "simulada" = gerada pelo site a partir das respostas (protótipo pra apresentação).
  //   "api"      = promoção real do sistema da Central de Voos (a TI integra; contrato no README).
  // Métricas pro painel (painel.html): função do Supabase (projeto CDV Financeiro) que grava os eventos anônimos.
  // Vazio = não grava nada.
  METRICAS_URL: "https://qjyswtxspktkqoyqjjwp.supabase.co/functions/v1/funil-evento",

  // Testes A/B. Pode rodar mais de um ao mesmo tempo: cada visitante é sorteado em cada teste, de forma independente.
  // O primeiro da lista é o "principal" (é o que aparece no painel com o filtro "Todos os testes").
  // nome: como aparece no painel (troque o nome a cada teste novo). pesos: % dos visitantes em cada versão.
  // variantes: o que muda em cada versão; o que não estiver lá usa o padrão.
  // O que pode mudar: abertura (lista de mensagens, uma bolha cada), abertura1, abertura2, botaoAbertura,
  // perguntaDestino ({nome} vira o nome da pessoa), bonusTitulo, botaoOferta e linkCheckout.
  // Pra ver uma versão: ?v=B força o primeiro teste; ?v_NOME=B força um teste pelo nome (ex.: ?v_orderbump-v1=B).
  EXPERIMENTOS: [
    // Desde 20/10/2026: mensagens iniciais. A = as de sempre (2 bolhas); B = 3 bolhas curtas.
    {
      nome: "abertura-v1",
      pesos: { A: 50, B: 50 },
      variantes: {
        A: {},
        B: {
          abertura: [
            "Oii! ✈️",
            "Preparei um *diagnóstico rápido* pra você 👇",
            "Em *2 minutinhos* você descobre *quanto pode economizar* na sua próxima viagem. Bora??",
          ],
        },
      },
    },
    // Desde 21/10/2026: checkout com ou sem order bump. A = sem order bump; B = com order bump.
    // O painel mostra as vendas reais da Hub.la de cada link (venda, order bump e receita).
    {
      nome: "orderbump-v1",
      pesos: { A: 50, B: 50 },
      variantes: {
        A: { linkCheckout: "https://pay.hub.la/Muxrk9khr04JS10t58pm" },
        B: { linkCheckout: "https://pay.hub.la/qslAT0ELAIjaV6sdgy84" },
      },
    },
  ],

  PROMOS_FONTE: "simulada",
  PROMOS_API_URL: "",
  // Nome do remetente no print, como um contato salvo (com a foto do logo ao lado).
  PROMO_REMETENTE: "Central de Voos",

  // Ritmo da conversa: tempo mínimo de "digitando" por mensagem (ms); depois de cada mensagem há uma pausa de leitura proporcional ao texto. No modo teste (?teste=1), tudo fica 5x mais rápido.
  DIGITANDO_MS: 1100,
};
