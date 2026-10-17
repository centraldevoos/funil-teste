// Configuração do funil interativo. É o arquivo que se edita à mão antes de publicar.
window.CONFIG = {
  // Foto do Henrique (fica em site/midia/).
  AVATAR_URL: "midia/henrique.png",

  // Link do checkout do VIP no Hub.la (fica fora do repositório por segurança). Vazio = botão mostra um aviso.
  LINK_CHECKOUT: "",
  CUPOM: "BOASVINDAS",

  // Áudios e vídeos do Henrique. Vazio = o trecho não aparece (no modo teste, aparece um aviso no lugar).
  // Áudio: .mp3 ou .m4a. Vídeo: .mp4 vertical (9:16). Pode ser caminho relativo (midia/boas-vindas.mp3) ou URL.
  MIDIA: {
    audioBoasVindas: "",   // depois do "Fala, viajante!": quem é ele e o que a pessoa vai descobrir
    audioResultado: "",    // logo depois do resultado: o que esse número significa
    videoHistoria: "",     // a viagem pra Paris pela metade do preço
    audioOferta: "",       // antes do cupom: por que entrar hoje
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
  PROMOS_FONTE: "simulada",
  PROMOS_API_URL: "",
  // Nome do remetente no print, como um contato salvo (com a foto do logo ao lado).
  PROMO_REMETENTE: "Central de Voos",

  // Ritmo da conversa: tempo mínimo de "digitando" por mensagem (ms); depois de cada mensagem há uma pausa de leitura proporcional ao texto. No modo teste (?teste=1), tudo fica 5x mais rápido.
  DIGITANDO_MS: 1100,
};
