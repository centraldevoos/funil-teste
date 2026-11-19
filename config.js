// Configuração do funil interativo. É o arquivo que se edita à mão antes de publicar.
window.CONFIG = {
  // Foto do Henrique (fica em site/midia/).
  AVATAR_URL: "midia/henrique-avatar.jpg",

  // Link do checkout do VIP na Hub.la (o padrão: cupom aplicado, sem order bump). O teste "orderbump-v2" abaixo troca o link por versão.
  // Vazio = botão mostra um aviso.
  // Desde 19/11/2026 o cupom é o BLACKVIP (87,0177% = R$ 3.058 por R$ 397), que vale só nas duas ofertas do teste
  // (WKYYwK sem bump e ahMvLr com bump). O BLACK antigo não pode ganhar oferta nova na Hub.la.
  LINK_CHECKOUT: "https://pay.hub.la/WKYYwK2YG3UFQOIYs8OY?coupon=BLACKVIP",
  CUPOM: "BLACKVIP",
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
    // Black a R$ 397 (05/11/2026): a mesma arte do fluxo do DataCrazy, "quanto custaria ter tudo isso por 1 ano".
    tabela397: "midia/fluxo/tabelaBlack.jpg",
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
    // Desde 19/11/2026 (pedido do dono): os dois lados com o cupom aplicado; o que muda é o order bump.
    // A = sem order bump (WKYYwK2YG3UFQOIYs8OY); B = com order bump "+1 pessoa por metade do valor", R$ 197
    // (oferta ahMvLr5zHw6qkukPyTvK; o bump é a oferta O0q2pK2RPmIZSW1oaGU9 do produto "Adicione mais uma pessoa").
    // O painel separa as vendas pelo link de cada versão; o bump é a compra do +1 pelo mesmo e-mail.
    {
      nome: "orderbump-v2",
      pesos: { A: 50, B: 50 },
      variantes: {
        A: { linkCheckout: "https://pay.hub.la/WKYYwK2YG3UFQOIYs8OY?coupon=BLACKVIP", cupomAplicado: "sim" },
        B: { linkCheckout: "https://pay.hub.la/ahMvLr5zHw6qkukPyTvK?coupon=BLACKVIP", cupomAplicado: "sim" },
      },
    },
    // Encerrado em 19/11/2026: "cupom-v1" (A = o3IjM8S2Shbp3YJI3Owv sem cupom; B = WKYYwK2YG3UFQOIYs8OY?coupon=BLACK).
    // Resultado: B, com o cupom aplicado, fez 12 vendas ÷ 60 cliques no checkout contra 6 ÷ 57 (R$ 1,62 contra R$ 0,78 por visita).
    // Pausado em 05/11/2026: "orderbump-v1" (A = Muxrk9khr04JS10t58pm sem order bump; B = qslAT0ELAIjaV6sdgy84 com order bump).
  ],

  PROMOS_FONTE: "simulada",
  PROMOS_API_URL: "",
  // Nome do remetente no print, como um contato salvo (com a foto do logo ao lado).
  PROMO_REMETENTE: "Central de Voos",

  // Ritmo da conversa: tempo mínimo de "digitando" por mensagem (ms); depois de cada mensagem há uma pausa de leitura proporcional ao texto. No modo teste (?teste=1), tudo fica 5x mais rápido.
  DIGITANDO_MS: 1100,
};
