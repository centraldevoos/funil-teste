// Funil interativo — Central de Voos.
// O roteiro (função roteiro, no fim) segue o fluxo "Tráfego Pago" da DataCrazy, mensagem por mensagem
// (ver ../fluxo-original/mapa-do-fluxo.md). Somados a ele: o nome da pessoa, o destino, quantas pessoas
// viajam e o cartão com a economia calculada. As peças de interface vêm antes do roteiro.
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const IMG = C.IMAGENS || {};
  const params = new URLSearchParams(location.search);
  const teste = params.get("teste") === "1";
  const ritmo = teste ? 0.2 : 1;
  const conversa = document.getElementById("conversa");
  // Telefone que vem no link do WhatsApp (?telefone=5531999999999). O DDD escolhe o aeroporto de saída.
  const TELEFONE = (params.get("telefone") || "").replace(/\D/g, "");
  // Nome que vem no link (?nome=Maria ou ?nome=Maria%20Silva): só a primeira palavra com letras, com a inicial maiúscula.
  // Se a ferramenta de disparo não trocou a variável (veio "{Nome do lead|leadName}", "{{nome}}"…), ignora e pergunta o nome.
  const NOME_LINK = (() => {
    const bruto = params.get("nome") || "";
    if (/[{}|[\]<>%$]/.test(bruto) || /\b(lead|nome|name|contato|cliente)\b/i.test(bruto)) return "";
    const m = bruto.match(/\p{L}[\p{L}'’-]*/u);
    if (!m || m[0].length < 2) return "";
    const n = m[0].slice(0, 30);
    return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  })();
  let TOTAL = 8;
  const dados = { nome: "", ondeCompra: "", milhas: "", destino: null, quando: null, pessoas: 1, origem: null };
  const eventos = (window.dataLayer = window.dataLayer || []);

  // ---------- testes A/B ----------
  // Pode haver vários testes ao mesmo tempo; cada um sorteia a versão por conta própria e guarda no aparelho.
  const LISTA_EXP = (Array.isArray(C.EXPERIMENTOS) ? C.EXPERIMENTOS : [C.EXPERIMENTO]).filter((x) => x && x.nome);
  const sortear = (exp, i) => {
    const nomes = Object.keys(exp.variantes || { A: {} });
    const forcada = (params.get("v_" + exp.nome) || (i === 0 ? params.get("v") : "") || "").toUpperCase();
    if (nomes.includes(forcada)) return forcada;
    const chave = "funil_variante_" + exp.nome;
    try { const salva = localStorage.getItem(chave); if (nomes.includes(salva)) return salva; } catch (e) {}
    const pesos = exp.pesos || {}, total = nomes.reduce((t, n) => t + (pesos[n] != null ? pesos[n] : 1), 0);
    let r = Math.random() * total, v = nomes[0];
    for (const n of nomes) { r -= pesos[n] != null ? pesos[n] : 1; if (r < 0) { v = n; break; } }
    try { localStorage.setItem(chave, v); } catch (e) {}
    return v;
  };
  const TESTES = {};
  LISTA_EXP.forEach((exp, i) => (TESTES[exp.nome] = sortear(exp, i)));
  // O primeiro teste é o principal (colunas experimento/variante do painel); todos vão em extra.testes.
  const EXP = LISTA_EXP[0] || null;
  const variante = EXP ? TESTES[EXP.nome] : null;
  // Texto (ou link) que pode mudar por versão: usa o da versão sorteada no teste que mexe nele; senão o padrão.
  // {nome} vira o nome da pessoa.
  const txt = (chave, padrao) => {
    let o = null;
    for (const exp of LISTA_EXP) { const v = exp.variantes && exp.variantes[TESTES[exp.nome]]; if (v && v[chave] != null) { o = v[chave]; break; } }
    return String(o != null ? o : padrao).replace(/\{nome\}/g, dados.nome || "");
  };

  // ---------- métricas (painel) ----------
  // Cada visita é uma sessão anônima. Os eventos vão em lotes pra função do Supabase (sem nome nem telefone).
  // No modo teste (?teste=1) não grava nada, a não ser com ?metricas=1 (aí marca como teste e o painel separa).
  const SESSAO = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const gravar = !!C.METRICAS_URL && (!teste || params.get("metricas") === "1");
  const EVENTOS_PAINEL = new Set(["inicio", "aceitou", "etapa", "promo_exemplo", "resultado", "abriu_presente", "oferta", "checkout", "copiou_cupom", "abriu_duvidas", "duvida", "atendente", "resposta", "erro", "toque"]);
  const INICIO_VISITA = Date.now();
  let filaMetricas = [];
  function despachar(saindo) {
    if (!gravar || !filaMetricas.length) return;
    const corpo = JSON.stringify(filaMetricas.splice(0, 40));
    try {
      if (saindo && navigator.sendBeacon) navigator.sendBeacon(C.METRICAS_URL, new Blob([corpo], { type: "text/plain" }));
      else fetch(C.METRICAS_URL, { method: "POST", body: corpo, headers: { "Content-Type": "text/plain" }, keepalive: true }).catch(() => {});
    } catch (e) {}
    if (filaMetricas.length) despachar(saindo);
  }
  if (gravar) {
    setInterval(despachar, 3000);
    window.addEventListener("pagehide", () => despachar(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) despachar(true); });
  }
  function anotar(evento, extra) {
    if (!gravar || !EVENTOS_PAINEL.has(evento)) return;
    if (evento === "resposta" && !(extra && extra.pergunta)) return; // só as respostas marcadas com a pergunta
    const d = dados.destino;
    filaMetricas.push({
      sessao: SESSAO, experimento: EXP ? EXP.nome : null, variante, evento, etapa: extra && extra.etapa,
      destino: d && d.cidade, regiao: d ? regiaoDe(d) : null, origem: dados.origem && dados.origem.cidade, pessoas: dados.pessoas,
      utm_source: params.get("utm_source"), utm_medium: params.get("utm_medium"), utm_campaign: params.get("utm_campaign"), utm_term: params.get("utm_term"),
      dispositivo: window.innerWidth < 768 ? "celular" : "computador", teste,
      extra: Object.assign({ ms: Date.now() - INICIO_VISITA }, LISTA_EXP.length ? { testes: TESTES } : null,
        evento === "checkout" ? { link: extra && extra.link } : null,
        evento === "toque" ? { x: extra.x, y: extra.y, alvo: extra.alvo, util: extra.util, raiva: extra.raiva || undefined, rx: extra.rx, ry: extra.ry } : null,
        evento === "erro" ? { onde: extra && extra.onde } : null,
        evento === "resultado" ? { economia: extra && extra.economia } : null,
        evento === "resposta" || evento === "duvida" ? { pergunta: extra.pergunta, valor: String(extra.valor || "").slice(0, 60) } : null),
    });
    if (evento === "inicio" || evento === "checkout") despachar(evento === "checkout");
  }
  const CUPOM = C.CUPOM || "BOASVINDAS";

  // ---------- utilidades ----------
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms * ritmo));
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Formatação do WhatsApp nos textos do fluxo: *negrito*, _itálico_, ~riscado~ e quebras de linha.
  const fmt = (t) => esc(t)
    .replace(/(^|[\s(>])\*([^*\n]+)\*/g, "$1<b>$2</b>")
    .replace(/(^|[\s(>])_([^_\n]+)_/g, "$1<i>$2</i>")
    .replace(/(^|[\s(>])~([^~\n]+)~/g, "$1<s>$2</s>")
    .replace(/\n/g, "<br>");
  const reais = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
  // Rola até o fim, como no WhatsApp: se a pessoa subiu pra reler, não puxa ela de volta (a não ser que seja forçado).
  const pertoDoFim = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 320;
  let seguir = true;
  // Botão "descer" do WhatsApp: aparece quando a pessoa subiu e chegou mensagem nova embaixo.
  const descer = document.createElement("button");
  descer.type = "button"; descer.className = "descer"; descer.setAttribute("aria-label", "Ir para a última mensagem");
  descer.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg><i></i>';
  descer.tabIndex = -1;
  document.body.appendChild(descer);
  descer.addEventListener("click", () => { seguir = true; descer.classList.remove("ver", "nova"); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); });
  window.addEventListener("scroll", () => { seguir = pertoDoFim(); descer.classList.toggle("ver", !seguir); descer.tabIndex = seguir ? -1 : 0; if (seguir) descer.classList.remove("nova"); }, { passive: true });
  const escrevendo = () => document.activeElement && document.activeElement.tagName === "INPUT";
  const rolar = (forcar) => requestAnimationFrame(() => { if (forcar !== true && escrevendo()) return; if (forcar === true || seguir) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); else descer.classList.add("ver", "nova"); });
  function registrar(evento, extra) {
    eventos.push({ event: "funil_" + evento, ...extra, variante, testes: TESTES });
    try { anotar(evento, extra); } catch (e) {}
    if (typeof window.fbq === "function") {
      if (evento === "resultado") window.fbq("track", "Lead");
      if (evento === "checkout") window.fbq("track", "InitiateCheckout");
    }
  }

  // ---------- mapa de calor ----------
  // Cada toque vai pro painel: posição na tela (0 a 1, só celular no mapa), o que foi tocado, se era clicável,
  // posição dentro do cartão da oferta (quando foi nele) e "toque de raiva" (3 toques rápidos no mesmo lugar).
  // Nada do que a pessoa digita é gravado. No máximo 80 toques por visita.
  const ALVOS_UTEIS = "button, a, input, select, textarea, label, [role=button], .bf-cartao .palco, .balao.foto img, .zap-img img, .visor";
  function nomeDoAlvo(el) {
    const util = el.closest(ALVOS_UTEIS);
    if (util) {
      if (util.matches(".atendente")) return "Falar com um atendente (WhatsApp)";
      if (util.matches(".opcao")) return "Botão: " + util.textContent.trim().slice(0, 40);
      if (util.matches(".cta")) return "Botão da oferta (checkout)";
      if (util.matches(".copiar")) return "Copiar cupom";
      if (util.closest(".bf-cartao")) return "Presente";
      if (util.matches("input")) return "Campo de texto";
      if (util.closest(".campo")) return "Enviar (seta)";
      if (util.matches("img")) return "Imagem (abrir)";
      if (util.closest(".visor")) return "Fechar imagem";
      if (util.matches(".descer")) return "Botão descer";
      if (util.closest(".rodape")) return "Rodapé";
      return "Outro botão";
    }
    if (el.closest(".oferta")) return "Cartão da oferta (fora do botão)";
    if (el.closest(".comparar")) return "Cartão Grátis/VIP/bônus";
    if (el.closest(".resultado")) return "Cartão da economia";
    if (el.closest(".zap")) return "Print da promoção (texto)";
    if (el.closest(".linha.ele")) return "Mensagem do Henrique";
    if (el.closest(".linha.eu")) return "Resposta da pessoa";
    if (el.closest("header")) return "Topo";
    if (el.closest(".dica-clique")) return "Dica \"Clique aqui\"";
    if (el.closest("#conversa")) return "Espaço vazio da conversa";
    return "Fundo da página";
  }
  let toquesGravados = 0, recentes = [];
  document.addEventListener("pointerdown", (e) => {
    if (!gravar || toquesGravados >= 80 || e.isPrimary === false || !(e.target instanceof Element)) return;
    const el = e.target, agora = Date.now(), W = window.innerWidth || 1, H = window.innerHeight || 1;
    recentes = recentes.filter((t) => agora - t.t < 900 && Math.hypot(t.x - e.clientX, t.y - e.clientY) < 40);
    recentes.push({ t: agora, x: e.clientX, y: e.clientY });
    const dados3 = (n) => Math.round(Math.min(Math.max(n, 0), 1) * 1000) / 1000;
    const toque = { x: dados3(e.clientX / W), y: dados3(e.clientY / H), alvo: nomeDoAlvo(el), util: !!el.closest(ALVOS_UTEIS), raiva: recentes.length >= 3 };
    const oferta = el.closest(".oferta");
    if (oferta) { const r = oferta.getBoundingClientRect(); toque.rx = dados3((e.clientX - r.left) / r.width); toque.ry = dados3((e.clientY - r.top) / r.height); }
    toquesGravados++;
    try { anotar("toque", toque); } catch (err) {}
  }, { capture: true, passive: true });

  // ---------- topo ----------
  // Barra de progresso no estilo do vturb: anda rápido no começo (parece que vai ser rapidinho) e vai
  // desacelerando perto do fim. Sem mostrar "x de y" (contar etapas pode espantar).
  function etapa(n) {
    if (n > 0) registrar("etapa", { etapa: n });
    const p = Math.max(0, Math.min(n / TOTAL, 1));
    progresso(0.06 + 0.84 * (1 - Math.pow(1 - p, 2.2)));
  }
  // Depois das perguntas, o resto do caminho (promoção → presente → oferta) completa a barra devagar.
  function progresso(fracao) { document.getElementById("barra").style.width = (Math.min(fracao, 1) * 100).toFixed(1) + "%"; }

  // ---------- som ----------
  let audioCtx = null;
  function destravarSom() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state !== "running") audioCtx.resume();
      // um instante de silêncio, tocado dentro do toque: é o que libera o som no iOS
      const b = audioCtx.createBuffer(1, 1, 22050), src = audioCtx.createBufferSource();
      src.buffer = b; src.connect(audioCtx.destination); src.start(0);
    } catch (e) { audioCtx = null; }
  }
  ["pointerdown", "touchend", "keydown"].forEach((ev) => window.addEventListener(ev, destravarSom, { passive: true }));
  function somMensagem() {
    if (!audioCtx || audioCtx.state !== "running" || document.hidden) return;
    // "ploc" macio de bolha: duas notas curtinhas subindo (sem o apito agudo de antes), passando por um filtro que tira o chiado
    const t = audioCtx.currentTime, filtro = audioCtx.createBiquadFilter(), mestre = audioCtx.createGain();
    filtro.type = "lowpass"; filtro.frequency.value = 2400; mestre.gain.value = 0.9;
    filtro.connect(mestre).connect(audioCtx.destination);
    [[0, 520, 780, 0.10], [0.075, 700, 1040, 0.08]].forEach(([d, f1, f2, vol]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f1, t + d); o.frequency.exponentialRampToValueAtTime(f2, t + d + 0.035);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(vol, t + d + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.09);
      o.connect(g).connect(filtro); o.start(t + d); o.stop(t + d + 0.1);
    });
  }
  const vibrarToque = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(8); } catch (e) {} };

  // ---------- mensagens ----------
  // A foto do Henrique fica só na última mensagem de uma sequência dele (classe "segue" nas anteriores).
  // Feito aqui e não com :has() no CSS porque o Safari do iPhone não recalcula quando o "digitando" some e a foto sumia.
  const marcarSequencias = () => {
    for (const el of conversa.children) {
      if (!el.classList.contains("ele")) continue;
      const prox = el.nextElementSibling;
      el.classList.toggle("segue", !!(prox && prox.classList.contains("linha") && prox.classList.contains("ele")));
    }
  };
  new MutationObserver(marcarSequencias).observe(conversa, { childList: true });
  const avatar = () => '<div class="avatar"><img src="' + esc(C.AVATAR_URL || "midia/henrique-avatar.jpg") + '" alt="Henrique"></div>';
  let digEl = null, digSome = null;
  function mostrarDigitando() {
    clearTimeout(digSome);
    if (!digEl) {
      digEl = document.createElement("div");
      digEl.className = "linha ele";
      digEl.innerHTML = avatar() + '<div class="balao digitando" aria-label="Henrique está digitando"><i></i><i></i><i></i></div>';
      conversa.appendChild(digEl); rolar();
    } else if (digEl !== conversa.lastElementChild) conversa.appendChild(digEl);
  }
  // some logo em seguida, a não ser que a próxima mensagem já comece a ser digitada (aí continua, sem piscar)
  function esconderDigitando(agora) {
    clearTimeout(digSome);
    const tirar = () => { if (digEl) { digEl.remove(); digEl = null; } };
    if (agora) tirar(); else digSome = setTimeout(tirar, 80);
  }
  // Bandeiras viram imagem (midia/bandeiras, estilo Twemoji): em alguns celulares o emoji da bandeira aparece preto.
  const comBandeiras = (html) => html.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, (f) => {
    const iso = [...f].map((c) => String.fromCharCode(c.codePointAt(0) - 127397)).join("").toLowerCase();
    return '<img class="bandeira" src="midia/bandeiras/' + iso + '.svg" alt="' + f + '" onerror="this.replaceWith(this.alt)">';
  });
  function linha(lado, html, classe) {
    esconderDigitando(true);
    html = comBandeiras(html);
    const el = document.createElement("div");
    el.className = "linha " + lado;
    el.innerHTML = lado === "ele" ? avatar() + '<div class="' + (classe || "balao") + '">' + html + "</div>" : '<div class="balao">' + html + "</div>";
    conversa.appendChild(el);
    if (lado === "eu") { seguir = true; rolar(true); } else { rolar(); somMensagem(); }
    return el;
  }
  async function digitando(ms) {
    mostrarDigitando();
    await esperar(ms);
    esconderDigitando();
  }
  // Trechos com muitas mensagens seguidas (a história de Paris) vão mais devagar.
  let calma = 1;
  // Ajuste em ms no tempo de leitura de cada mensagem num trecho: −1000 na abertura (1 s mais rápido), +1000 na oferta.
  let ajuste = 0;
  // Uma mensagem do Henrique, com texto no formato do WhatsApp. O "digitando" acompanha o tamanho do texto.
  // Tempo pra ler a mensagem antes de a próxima começar a ser digitada (cerca de 40 letras por segundo).
  // Ritmo: ~3 s entre mensagens curtas e ~5 s nas longas. Cartões grandes (vantagens, bônus, tabela) ganham tempo de leitura
  // proporcional ao texto (até 9 s), porque na DataCrazy cada um esperava a pessoa tocar num botão antes de seguir.
  const leitura = (n) => Math.min(900 + n * 14, 3000);
  async function ele(texto, ms) {
    const t = ms != null ? ms : Math.min((C.DIGITANDO_MS || 1100) + texto.length * 5, 2200);
    await digitando(t * calma);
    const el = linha("ele", fmt(texto));
    await digitando(Math.max(300, leitura(texto.length) * calma + ajuste));
    return el;
  }
  async function eleHtml(html, classe, ms) {
    await digitando(ms != null ? ms : 1100);
    const el = linha("ele", html, classe);
    await digitando(Math.min(2500 + html.replace(/<[^>]+>/g, "").length * 25, 9000));
    return el;
  }
  // Cartão que a pessoa usa na hora (diagnóstico, presente, oferta): aparece e já funciona, sem pausa depois.
  async function cartao(html, classe, ms) { await digitando(Math.max(300, (ms != null ? ms : 1100) + ajuste)); return linha("ele", html, classe); }
  const eu = (texto) => linha("eu", esc(texto));
  // Tamanho real das imagens do fluxo (midia/fluxo), pra reservar o espaço certo antes de carregar.
  const TAMANHO_IMG = { tarifaAward: [800, 813], googleParis: [800, 1422], pagouParis: [800, 1200], viagemParis: [800, 1200], carlosSantiago: [800, 1008], julianaEgito: [800, 1000], comoAplicarCupom: [800, 1000] };
  async function foto(url, legenda, alt) {
    if (!url) return;
    await digitando(1100);
    const chave = (String(url).match(/([A-Za-z]+)\.(?:jpe?g|png|webp)$/) || [])[1];
    const tam = TAMANHO_IMG[chave] ? ' width="' + TAMANHO_IMG[chave][0] + '" height="' + TAMANHO_IMG[chave][1] + '"' : "";
    const el = linha("ele", '<figure style="margin:0"><img src="' + esc(url) + '"' + tam + ' alt="' + esc(alt || "") + '">' + (legenda ? "<figcaption>" + fmt(legenda) + "</figcaption>" : "") + "</figure>", "balao foto");
    el.querySelector("img").addEventListener("load", rolar);
    await digitando(Math.max(300, (legenda ? leitura(legenda.length) + 1200 : 2800) * calma + ajuste));
  }
  // Vídeo do vturb dentro da conversa (o código do player é o mesmo que o vturb dá; o script é carregado uma vez só).
  const vturbCarregados = new Set();
  async function videoVturb(chave, rotulo) {
    const v = (C.VTURB || {})[chave];
    if (!v || !v.id) return avisoTeste("🎬 Vídeo do vturb entra aqui (VTURB." + chave + ")");
    await digitando(1400);
    const el = linha("ele", '<vturb-smartplayer id="' + esc(v.id) + '" style="display:block;margin:0 auto;width:100%;max-width:400px;"><div class="vturb-player-placeholder" style="position:relative;width:100%;padding:177.77777777777777% 0 0;z-index:0;background-color:black;"></div></vturb-smartplayer>', "video vturb");
    el.querySelector(".vturb").setAttribute("aria-label", rotulo || "Vídeo");
    if (v.script && !vturbCarregados.has(v.script)) {
      vturbCarregados.add(v.script);
      const sc = document.createElement("script"); sc.src = v.script; sc.async = true; document.head.appendChild(sc);
    }
    registrar("video_vturb", { video: chave });
    await digitando(3500);
  }
  async function dica(texto) { await esperar(300); return linha("ele", fmt(texto), "balao dica"); }

  async function avisoTeste(texto) {
    if (!teste) return;
    const el = await ele(texto, 150);
    el.querySelector(".balao").classList.add("aviso-teste");
  }
  // Áudio no estilo do WhatsApp. Sem arquivo em config.js, não aparece.
  async function audio(chave) {
    const src = (C.MIDIA || {})[chave];
    if (!src) return avisoTeste("🎙️ Áudio do Henrique entra aqui (MIDIA." + chave + ")");
    await digitando(1500);
    const barras = Array.from({ length: 34 }, (_, i) => '<i style="height:' + Math.round(22 + Math.abs(Math.sin(i * 1.9) * Math.cos(i * .7)) * 78) + '%"></i>').join("");
    const el = linha("ele", '<div class="audio"><button type="button" aria-label="Ouvir o áudio do Henrique"><svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M1 1.5v13l12-6.5z"/></svg></button><div class="ondas" aria-hidden="true">' + barras + '</div><time>0:00</time></div><audio preload="metadata" src="' + esc(src) + '"></audio>');
    const a = el.querySelector("audio"), b = el.querySelector("button"), tempo = el.querySelector("time"), ondas = [...el.querySelectorAll(".ondas i")];
    const play = b.innerHTML, pausa = '<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="9" y="1" width="4" height="14" rx="1"/></svg>';
    const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    a.addEventListener("loadedmetadata", () => (tempo.textContent = mmss(a.duration)));
    a.addEventListener("timeupdate", () => { const p = a.currentTime / (a.duration || 1); ondas.forEach((o, i) => o.classList.toggle("tocou", i / ondas.length < p)); tempo.textContent = mmss(a.currentTime); });
    a.addEventListener("ended", () => (b.innerHTML = play));
    b.addEventListener("click", () => { if (a.paused) { a.play(); b.innerHTML = pausa; registrar("audio", { audio: chave }); } else { a.pause(); b.innerHTML = play; } });
  }
  async function video(chave) {
    const src = (C.MIDIA || {})[chave];
    if (!src) return avisoTeste("🎬 Vídeo do Henrique entra aqui (MIDIA." + chave + ")");
    await digitando(1200);
    const el = linha("ele", '<video src="' + esc(src) + '" playsinline controls preload="metadata"></video>', "video");
    el.querySelector("video").addEventListener("play", () => registrar("video", { video: chave }), { once: true });
  }

  // ---------- imagem em tela cheia ----------
  const visor = document.createElement("div");
  visor.className = "visor"; visor.setAttribute("role", "dialog"); visor.setAttribute("aria-label", "Imagem ampliada"); visor.hidden = true;
  visor.innerHTML = '<button type="button" class="visor-fechar" aria-label="Fechar">✕</button><img alt="">';
  document.body.appendChild(visor);
  const fecharVisor = () => { visor.hidden = true; document.documentElement.classList.remove("visor-aberto"); };
  visor.addEventListener("click", fecharVisor);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !visor.hidden) fecharVisor(); });
  conversa.addEventListener("click", (e) => {
    const img = e.target.closest(".balao.foto img, .zap-img img");
    if (!img) return;
    const v = visor.querySelector("img");
    v.src = img.currentSrc || img.src; v.alt = img.alt || "";
    visor.hidden = false; document.documentElement.classList.add("visor-aberto");
    registrar("abriu_imagem", {});
  });

  // ---------- respostas ----------
  // Último movimento da pessoa na tela (a cutucada não aparece pra quem está lendo ou rolando).
  let ultimoMovimento = Date.now();
  ["scroll", "pointerdown", "touchstart", "keydown", "wheel"].forEach((ev) => window.addEventListener(ev, () => (ultimoMovimento = Date.now()), { passive: true }));

  // Dica "Clique aqui" embaixo dos botões: no primeiro já aparece junto; nos outros, se a pessoa ficar 5 s sem clicar.
  let primeiroBotao = true;
  // Botões de resposta. Se a pessoa ficar 50 s sem responder e sem mexer na tela, o Henrique cutuca uma vez, embaixo dos botões.
  function opcoes(lista, modo) {
    esconderDigitando(true);
    return new Promise((resolve) => {
      const caixa = document.createElement("div");
      caixa.className = "opcoes" + (modo === "lista" ? " lista" : "");
      const limite = 70000;
      let cutucada, respondeu = false;
      const vigiar = (espera) => {
        cutucada = setTimeout(async () => {
          const parado = Date.now() - ultimoMovimento;
          if (parado < limite) return vigiar(limite - parado);
          if (respondeu) return;
          mostrarDigitando();
          await esperar(1200);
          if (!respondeu) linha("ele", fmt("👆👆\nAguardo a sua resposta para te ajudar a economizar nas suas passagens! 🤝✈️"));
        }, espera);
      };
      vigiar(limite);
      const dica = document.createElement("div");
      dica.className = "dica-clique";
      dica.setAttribute("aria-hidden", "true");
      dica.textContent = lista.length === 1 ? "👆 Clique aqui" : "👆 Clique em uma opção";
      const mostrarDica = () => { if (respondeu || dica.isConnected) return; caixa.appendChild(dica); rolar(); };
      const timerDica = setTimeout(mostrarDica, primeiroBotao ? 0 : 5000);
      primeiroBotao = false;
      for (const o of lista) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "opcao" + (o.principal || lista.length === 1 ? " principal" : "");
        b.innerHTML = modo === "lista" ? "<span>" + esc(o.texto) + "</span>" + (o.detalhe ? "<small>" + esc(o.detalhe) + "</small>" : "") : esc(o.texto);
        b.addEventListener("click", () => { vibrarToque(); respondeu = true; clearTimeout(cutucada); clearTimeout(timerDica); caixa.remove(); eu(o.texto); registrar("resposta", { resposta: o.valor || o.texto }); resolve(o); });
        caixa.appendChild(b);
      }
      conversa.appendChild(caixa); rolar(true);
    });
  }
  function campoNome() {
    esconderDigitando(true);
    return new Promise((resolve) => {
      const f = document.createElement("form");
      f.className = "campo";
      f.noValidate = true;
      f.innerHTML = '<input name="nome" autocomplete="given-name" enterkeyhint="send" maxlength="40" placeholder="Seu primeiro nome" aria-label="Seu primeiro nome"><button type="submit" aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>';
      const input = f.querySelector("input"), botao = f.querySelector("button");
      let erro = null;
      const valido = () => /\p{L}{2,}/u.test(input.value.trim());
      input.addEventListener("input", () => { botao.classList.toggle("pronto", valido()); if (erro) { erro.remove(); erro = null; } });
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!valido()) {
          if (!erro) { erro = document.createElement("div"); erro.className = "erro"; erro.textContent = "Escreve o seu nome pra eu te chamar direitinho."; f.after(erro); }
          return input.focus();
        }
        f.remove(); if (erro) erro.remove();
        // só a primeira palavra com letras (ignora símbolos, números e o que não for nome)
        const n = (input.value.match(/\p{L}[\p{L}'’-]*/u) || [""])[0];
        resolve(n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
      });
      conversa.appendChild(f); rolar(true);
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    });
  }

  // Campo de texto da conversa (usado pra data e pra cidade de saída).
  function campoTexto({ nome, placeholder, rotulo, sugestoes, atalhos }) {
    esconderDigitando(true);
    return new Promise((resolve) => {
      const f = document.createElement("form");
      f.className = "campo";
      f.noValidate = true;
      const lista = sugestoes ? "sugestoes-" + nome : "";
      f.innerHTML = '<input name="' + nome + '"' + (lista ? ' list="' + lista + '"' : "") + ' autocomplete="off" enterkeyhint="send" maxlength="60" placeholder="' + esc(placeholder) + '" aria-label="' + esc(rotulo) + '"><button type="submit" aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>' +
        (lista ? '<datalist id="' + lista + '">' + sugestoes.map((v) => '<option value="' + esc(v) + '">').join("") + "</datalist>" : "");
      const input = f.querySelector("input"), botao = f.querySelector("button");
      input.addEventListener("input", () => botao.classList.toggle("pronto", input.value.trim().length >= 2));
      let chips = null;
      const enviar = (v) => { f.remove(); if (chips) chips.remove(); resolve(v.trim()); };
      f.addEventListener("submit", (e) => { e.preventDefault(); if (input.value.trim().length < 2) return input.focus(); enviar(input.value); });
      conversa.appendChild(f);
      if (atalhos && atalhos.length) {
        chips = document.createElement("div");
        chips.className = "opcoes";
        chips.setAttribute("aria-label", "Sugestões");
        atalhos.forEach((a) => { const b = document.createElement("button"); b.type = "button"; b.className = "opcao"; b.textContent = a; b.addEventListener("click", () => { vibrarToque(); enviar(a); }); chips.appendChild(b); });
        conversa.appendChild(chips);
      }
      rolar(true);
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    });
  }

  // Destino livre (qualquer lugar do mundo), com sugestões da lista e alguns atalhos.
  function campoDestino() {
    esconderDigitando(true);
    return new Promise((resolve) => {
      const f = document.createElement("form");
      f.className = "campo";
      f.noValidate = true;
      const lista = "destinos-sugeridos";
      f.innerHTML = '<input name="destino" list="' + lista + '" autocomplete="off" enterkeyhint="send" maxlength="60" placeholder="Ex.: Paris, Cancún, Xangai…" aria-label="Destino dos sonhos"><button type="submit" aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>' +
        '<datalist id="' + lista + '">' + MUNDO.filter((m) => m.nome !== "Nordeste").map((m) => '<option value="' + esc(m.nome) + '">').join("") + "</datalist>";
      const input = f.querySelector("input"), botao = f.querySelector("button");
      const atalhos = document.createElement("div");
      atalhos.className = "opcoes";
      const enviar = (v) => { f.remove(); atalhos.remove(); resolve(v.trim()); };
      for (const a of ["Paris", "Orlando", "Lisboa", "Cancún", "Santiago", "Nordeste"]) {
        const b = document.createElement("button"); b.type = "button"; b.className = "opcao"; b.textContent = a;
        b.addEventListener("click", () => enviar(a));
        atalhos.appendChild(b);
      }
      input.addEventListener("input", () => botao.classList.toggle("pronto", input.value.trim().length >= 2));
      f.addEventListener("submit", (e) => { e.preventDefault(); if (input.value.trim().length < 2) return input.focus(); enviar(input.value); });
      conversa.appendChild(f); conversa.appendChild(atalhos); rolar(true);
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    });
  }

  // ---------- cartões ----------
  async function carregando(titulo, passos, msPorPasso) {
    const html = '<p class="titulo">' + esc(titulo) + "</p>" + passos.map((p, i) => '<div class="passo' + (i ? "" : " fazendo") + '"><span class="ic"></span><span>' + esc(p.texto || p).replace("{n}", '<b class="n">0</b>') + "</span></div>").join("") + '<div class="barra"><i></i></div>';
    const el = await cartao(html, "cartao", 500);
    const itens = [...el.querySelectorAll(".passo")], barra = el.querySelector(".barra i");
    const ms = msPorPasso || 1250;
    for (let i = 0; i < itens.length; i++) {
      barra.style.width = Math.round(((i + 0.7) / itens.length) * 100) + "%";
      const n = itens[i].querySelector(".n");
      if (n && passos[i].ate) contar(n, passos[i].ate, ms * 0.9);
      await esperar(ms);
      itens[i].classList.replace("fazendo", "feito");
      if (itens[i + 1]) itens[i + 1].classList.add("fazendo");
    }
    barra.style.width = "100%";
    await esperar(500);
  }
  function contar(el, ate, ms) {
    const ini = performance.now(), dur = (ms || 1700) * ritmo;
    // O relógio é sempre o performance.now(): o horário que o requestAnimationFrame entrega pode vir em outra base
    // em alguns celulares (era isso que fazia o contador mostrar números absurdos). E o valor fica sempre entre 0 e o final.
    (function passo() {
      const p = Math.max(0, Math.min((performance.now() - ini) / dur, 1)), e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.max(0, Math.min(ate, Math.round(ate * e))).toLocaleString("pt-BR");
      if (p < 1) requestAnimationFrame(passo);
    })();
    // Garante o número final mesmo se a aba estiver em segundo plano (o navegador pausa a animação).
    setTimeout(() => (el.textContent = Math.round(ate).toLocaleString("pt-BR")), dur + 50);
  }
  // Contagem regressiva de 15 minutos a partir do momento em que a oferta aparece.
  function relogio15(el) {
    const fim = Date.now() + 15 * 60 * 1000;
    const tick = () => {
      const s = Math.max(0, Math.floor((fim - Date.now()) / 1000));
      el.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    };
    tick(); setInterval(tick, 1000);
  }

  // ---------- conteúdo do fluxo ----------
  // As 10 rotas que o fluxo mostra antes do cupom (preço normal → preço da promoção que já foi enviada, por pessoa).
  const ROTAS = [
    { cidade: "Porto Alegre", bandeira: "🇧🇷", de: 1123, por: 432 },
    { cidade: "Recife", bandeira: "🇧🇷", de: 1553, por: 512 },
    { cidade: "Fortaleza", bandeira: "🇧🇷", de: 2365, por: 548 },
    { cidade: "Santiago", bandeira: "🇨🇱", de: 1500, por: 726 },
    { cidade: "Nassau", bandeira: "🇧🇸", de: 2900, por: 1340 },
    { cidade: "Orlando", bandeira: "🇺🇸", de: 3100, por: 1613 },
    { cidade: "Porto", bandeira: "🇵🇹", de: 4300, por: 2760 },
    { cidade: "Roma", bandeira: "🇮🇹", de: 5200, por: 2520 },
    { cidade: "Bangkok", bandeira: "🇹🇭", de: 8400, por: 4560 },
    { cidade: "Tóquio", bandeira: "🇯🇵", de: 9054, por: 4880 },
  ];
  const GRATIS = [
    ["sim", "6 promoções por dia"], ["sim", "Precisa ter milhas"], ["sim", "Promos boas"], ["nao", "Promos excelentes"],
    ["nao", "Emitir com PIX ou Cartão"], ["nao", "Acesso antecipado a MEGA PROMOS"], ["nao", "Calendário completo"],
    ["nao", "Grupos separados por região"], ["nao", "Plataforma exclusiva com busca de promoções"],
    ["nao", "Monitoramento das suas passagens com IA"], ["nao", "Suporte individual"],
  ];
  const VIP = [
    "+150 promoções por dia", "Emitir com PIX ou Cartão", "Emitir com milhas", "Promos boas e excelentes",
    "Acesso antecipado a MEGA PROMOS", "Calendário da promoção completo!", "Grupos separados por região",
    "Plataforma exclusiva com busca de promoções por origem e destino", "Monitoramento das suas passagens com IA",
    "Suporte individual", "Garantia de 7 dias",
  ];
  const BONUS = [
    { icone: "🎓", titulo: "Curso completo de milhas", texto: "Vídeo aulas bem explicativas de como decolar no mundo das milhas." },
    { icone: "⚖️", titulo: "Advogada do viajante", texto: "Suporte <b>individual</b> com a nossa advogada especializada em direito do viajante." },
    { icone: "🚀", titulo: "Grupo de Estratégias", texto: "Como acumular e multiplicar milhas, cartões, salas VIP e oportunidades em primeira mão." },
  ];

  // ---------- promoção de exemplo (o "print" do WhatsApp) ----------
  // Modo "simulada": gerada aqui, a partir do destino e da cidade de saída. Os dados abaixo são de exemplo
  // e não são promoções reais. Modo "api": a TI liga PROMOS_API_URL ao sistema (contrato no README).
  const ORIGENS = [
    { texto: "São Paulo", iata: "GRU", lat: -23.43, lon: -46.47 }, { texto: "Rio de Janeiro", iata: "GIG", lat: -22.81, lon: -43.25 },
    { texto: "Belo Horizonte", iata: "CNF", lat: -19.63, lon: -43.97 }, { texto: "Brasília", iata: "BSB", lat: -15.87, lon: -47.92 },
    { texto: "Salvador", iata: "SSA", lat: -12.91, lon: -38.33 }, { texto: "Recife", iata: "REC", lat: -8.13, lon: -34.92 },
    { texto: "Fortaleza", iata: "FOR", lat: -3.78, lon: -38.53 }, { texto: "Curitiba", iata: "CWB", lat: -25.53, lon: -49.18 },
    { texto: "Porto Alegre", iata: "POA", lat: -29.99, lon: -51.17 }, { texto: "Outra cidade", iata: "GRU", cidade: "São Paulo", lat: -23.43, lon: -46.47 },
  ];

  // DDD → aeroporto grande mais próximo (de onde as promoções costumam sair pra quem mora ali).
  const AEROPORTOS = {
    GRU: ["São Paulo", -23.43, -46.47], VCP: ["Campinas", -23.01, -47.13], GIG: ["Rio de Janeiro", -22.81, -43.25], VIX: ["Vitória", -20.26, -40.29],
    CNF: ["Belo Horizonte", -19.63, -43.97], CWB: ["Curitiba", -25.53, -49.18], IGU: ["Foz do Iguaçu", -25.6, -54.49], FLN: ["Florianópolis", -27.67, -48.55],
    POA: ["Porto Alegre", -29.99, -51.17], BSB: ["Brasília", -15.87, -47.92], GYN: ["Goiânia", -16.63, -49.22], PMW: ["Palmas", -10.29, -48.36],
    CGB: ["Cuiabá", -15.65, -56.12], CGR: ["Campo Grande", -20.47, -54.67], RBR: ["Rio Branco", -9.87, -67.9], PVH: ["Porto Velho", -8.71, -63.9],
    SSA: ["Salvador", -12.91, -38.33], AJU: ["Aracaju", -10.98, -37.07], REC: ["Recife", -8.13, -34.92], MCZ: ["Maceió", -9.51, -35.79],
    JPA: ["João Pessoa", -7.15, -34.95], NAT: ["Natal", -5.77, -35.38], FOR: ["Fortaleza", -3.78, -38.53], THE: ["Teresina", -5.06, -42.82],
    BEL: ["Belém", -1.38, -48.48], MAO: ["Manaus", -3.04, -60.05], BVB: ["Boa Vista", 2.85, -60.69], MCP: ["Macapá", 0.05, -51.07], SLZ: ["São Luís", -2.59, -44.24],
  };
  const DDD_AEROPORTO = {
    11: "GRU", 12: "GRU", 13: "GRU", 14: "VCP", 15: "VCP", 16: "VCP", 17: "VCP", 18: "VCP", 19: "VCP",
    21: "GIG", 22: "GIG", 24: "GIG", 27: "VIX", 28: "VIX",
    31: "CNF", 32: "CNF", 33: "CNF", 34: "CNF", 35: "CNF", 37: "CNF", 38: "CNF",
    41: "CWB", 42: "CWB", 43: "CWB", 44: "CWB", 45: "IGU", 46: "CWB", 47: "FLN", 48: "FLN", 49: "FLN",
    51: "POA", 53: "POA", 54: "POA", 55: "POA",
    61: "BSB", 62: "GYN", 63: "PMW", 64: "GYN", 65: "CGB", 66: "CGB", 67: "CGR", 68: "RBR", 69: "PVH",
    71: "SSA", 73: "SSA", 74: "SSA", 75: "SSA", 77: "SSA", 79: "AJU",
    81: "REC", 82: "MCZ", 83: "JPA", 84: "NAT", 85: "FOR", 86: "THE", 87: "REC", 88: "FOR", 89: "THE",
    91: "BEL", 92: "MAO", 93: "BEL", 94: "BEL", 95: "BVB", 96: "MCP", 97: "MAO", 98: "SLZ", 99: "SLZ",
  };
  function origemPorTelefone() {
    let t = TELEFONE;
    if ((t.length === 12 || t.length === 13) && t.startsWith("55")) t = t.slice(2);
    else if (t.length !== 10 && t.length !== 11) return null;
    const iata = DDD_AEROPORTO[Number(t.slice(0, 2))];
    if (!iata) return null;
    const a = AEROPORTOS[iata];
    return { texto: a[0], cidade: a[0], iata, lat: a[1], lon: a[2], ddd: t.slice(0, 2) };
  }

  // Siglas e apelidos que as pessoas escrevem no lugar do nome da cidade (estado vale a capital; código de aeroporto
  // vale a cidade dele). Usado na cidade de saída e no destino.
  const SIGLAS = {
    sp: "São Paulo", sampa: "São Paulo", "sao paulo capital": "São Paulo", "sp capital": "São Paulo", guarulhos: "São Paulo", congonhas: "São Paulo", cgh: "São Paulo",
    rj: "Rio de Janeiro", rio: "Rio de Janeiro", galeao: "Rio de Janeiro", "santos dumont": "Rio de Janeiro", sdu: "Rio de Janeiro",
    bh: "Belo Horizonte", beaga: "Belo Horizonte", mg: "Belo Horizonte", confins: "Belo Horizonte", plu: "Belo Horizonte",
    viracopos: "Campinas", bsb: "Brasília", df: "Brasília", poa: "Porto Alegre", rs: "Porto Alegre", floripa: "Florianópolis", sc: "Florianópolis",
    cwb: "Curitiba", pr: "Curitiba", ssa: "Salvador", ba: "Salvador", rec: "Recife", pe: "Recife", fortal: "Fortaleza", ce: "Fortaleza",
    jp: "João Pessoa", jampa: "João Pessoa", pb: "João Pessoa", rn: "Natal", al: "Maceió", se: "Aracaju", es: "Vitória", vix: "Vitória",
    go: "Goiânia", gyn: "Goiânia", mt: "Cuiabá", cgb: "Cuiabá", ms: "Campo Grande", cg: "Campo Grande", to: "Palmas", am: "Manaus", mao: "Manaus",
    pa: "Belém", bel: "Belém", ma: "São Luís", slz: "São Luís", pi: "Teresina", the: "Teresina", ro: "Porto Velho", ac: "Rio Branco", rr: "Boa Vista", ap: "Macapá",
    foz: "Foz do Iguaçu", bsas: "Buenos Aires", "bs as": "Buenos Aires", cdmx: "Cidade do México", nyc: "Nova York", lv: "Las Vegas",
  };
  const UFS = "ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to";
  // "São Paulo - SP", "Recife PE", "Campinas/SP" → tira o estado do fim; se só sobrar a sigla, troca pelo nome da cidade.
  function expandirSigla(t) {
    if (SIGLAS[t]) return tirarAcento(SIGLAS[t]);
    const semUf = t.replace(new RegExp("\\s(" + UFS + ")$"), "").replace(/\s(capital|brasil)$/, "").trim();
    if (semUf && semUf !== t) return SIGLAS[semUf] ? tirarAcento(SIGLAS[semUf]) : semUf;
    return t;
  }

  // ----- destinos do mundo (lista em destinos.js) -----
  const tirarAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const bandeiraDe = (iso) => (iso && iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "");
  const MUNDO = (window.DESTINOS_MUNDO || []).map((d) => ({ nome: d[0], aliases: d[1] ? d[1].split(",") : [], iata: d[2], pais: d[3], iso: d[4], lat: d[5], lon: d[6], tipo: d[7], foto: d[8] || null, mostrar: d[9] || d[0] }));
  const INDICE = new Map();
  for (const d of MUNDO) for (const n of [d.nome, ...d.aliases]) INDICE.set(tirarAcento(n), d);
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  function fotoDe(d) {
    const tipos = window.FOTOS_POR_TIPO || {};
    const lista = tipos[d.tipo] || tipos.historica || ["paris"];
    return "midia/destinos/" + (d.foto || lista[hash(d.nome) % lista.length]) + ".jpg";
  }
  function distanciaKm(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  // Resolve o que a pessoa digitou: primeiro a lista; depois a Open-Meteo (gratuita, sem chave); sem nada, guarda só o nome.
  function distanciaEdicao(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    let ant = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = cur;
    }
    return ant[n];
  }
  function parecido(t) {
    if (t.length < 4) return null;
    const limite = t.length <= 6 ? 1 : 2;
    let melhor = null;
    for (const [k, d] of INDICE) { const dist = distanciaEdicao(t, k); if (dist <= limite && (!melhor || dist < melhor.dist)) melhor = { dist, d }; }
    return melhor && melhor.d;
  }
  // A cidade do aeroporto de um destino: Porto de Galinhas → Recife, Interlaken → Zurique, Gramado → Porto Alegre.
  const SEM_AEROPORTO = new Set(["Porto de Galinhas", "Arraial d'Ajuda", "Trancoso", "Canela", "Gramado", "Itacaré", "Ubatuba", "Angra dos Reis", "Arraial do Cabo", "Boipeba", "Machu Picchu", "Playa del Carmen", "Tulum", "Costa Amalfitana", "Agra", "Campos do Jordão", "Ouro Preto", "Paraty", "Búzios", "Ilhabela", "Morro de São Paulo", "Chapada dos Veadeiros", "Pantanal", "Bonito", "Interlaken", "Jerusalém", "Quioto", "Maragogi", "Pipa", "Lençóis Maranhenses", "Alter do Chão", "Jalapão"]);
  const CIDADE_AEROPORTO = { CUN: "Cancún", CUZ: "Cusco", NAP: "Nápoles", DEL: "Nova Délhi", ZRH: "Zurique", TLV: "Tel Aviv", KIX: "Osaka", STM: "Santarém", BPS: "Porto Seguro", IOS: "Ilhéus" };
  function cidadeDoAeroporto(dest) {
    if (!dest.iata || !SEM_AEROPORTO.has(dest.nome)) return dest.nome;
    if (AEROPORTOS[dest.iata]) return AEROPORTOS[dest.iata][0];
    if (CIDADE_AEROPORTO[dest.iata]) return CIDADE_AEROPORTO[dest.iata];
    const primeira = MUNDO.find((m) => m.iata === dest.iata && !SEM_AEROPORTO.has(m.nome));
    return primeira ? primeira.nome : dest.nome;
  }
  // Pra um lugar do Brasil fora da lista, o aeroporto grande mais perto.
  function aeroportoMaisPerto(lat, lon) {
    let melhor = null;
    for (const [iata, a] of Object.entries(AEROPORTOS)) { const km = distanciaKm({ lat, lon }, { lat: a[1], lon: a[2] }); if (!melhor || km < melhor.km) melhor = { km, iata }; }
    return melhor.iata;
  }
  async function resolverDestino(texto) {
    const t = expandirSigla(tirarAcento(texto));
    // "quero ir pra Salvador" acha Salvador; "El Salvador" e "Porto Velho" não (as outras palavras não são de ligação).
    const LIGACAO = new Set(["quero", "queria", "ir", "pra", "para", "a", "o", "de", "do", "da", "em", "no", "na", "cidade", "praia", "praias", "viajar", "conhecer", "visitar", "sonho", "meu", "e", "com", "minha", "familia", "voltar"]);
    const contemPalavra = (maior, menor) => (" " + maior + " ").includes(" " + menor + " ");
    const sobraSoLigacao = (maior, menor) => (" " + maior + " ").replace(" " + menor + " ", " ").trim().split(" ").filter(Boolean).every((p) => LIGACAO.has(p));
    const d = INDICE.get(t) || (t.length === 3 && MUNDO.find((m) => m.iata && m.iata.toLowerCase() === t)) || MUNDO.find((m) => [m.nome, ...m.aliases].some((n) => { const k = tirarAcento(n); return k.length > 3 && t.length > 3 && ((contemPalavra(t, k) && sobraSoLigacao(t, k)) || contemPalavra(k, t)); })) || parecido(t);
    if (d) return { ...d, cidade: d.mostrar, cidadeVoo: d.nome === "Nordeste" ? d.mostrar : cidadeDoAeroporto(d), foto: fotoDe(d), bandeira: bandeiraDe(d.iso), conhecido: true };
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&format=json&name=" + encodeURIComponent(texto.trim()), { signal: ctrl.signal });
      const j = await r.json();
      const g = j.results && j.results[0];
      if (g) {
        const praia = /praia|beach|playa|ilha|island|isla|costa|cabo|bay|baia|baía/i.test(texto + " " + (g.admin1 || "")) ;
        const base = { nome: g.name, iata: "", pais: g.country || "", iso: g.country_code, lat: g.latitude, lon: g.longitude, tipo: praia ? "praia" : g.country_code === "BR" ? "natureza" : "historica", foto: null };
        if (g.country_code === "BR") { base.iata = aeroportoMaisPerto(g.latitude, g.longitude); }
        return { ...base, cidade: g.name, cidadeVoo: base.iata ? AEROPORTOS[base.iata][0] : g.name, foto: fotoDe(base), bandeira: bandeiraDe(g.country_code), conhecido: false };
      }
    } catch (e) { /* sem rede: segue só com o nome digitado */ }
    const nome = texto.trim().replace(/\s+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    const base = { nome, iata: "", pais: "", iso: "", lat: null, lon: null, tipo: "historica", foto: null };
    return { ...base, cidade: nome, cidadeVoo: nome, foto: fotoDe(base), bandeira: "", conhecido: false };
  }
  // Regiões de preço. "trecho" = valor da promoção no VIP, por trecho e por pessoa (faixas definidas pelo dono);
  // "companhia" = valor vendido no site das companhias aéreas, por trecho e por pessoa.
  const FAIXAS = [
    { id: "brasil", nome: "Brasil", trecho: [188, 387], companhia: [412, 648], cias: [["GOL", "Smiles"], ["Azul", "TudoAzul"], ["LATAM", "LATAM Pass"]] },
    { id: "america-sul", nome: "América do Sul", trecho: [322, 876], companhia: [615, 1412], cias: [["LATAM", "LATAM Pass"], ["Aerolíneas Argentinas", "Smiles"], ["Copa Airlines", "ConnectMiles"]] },
    { id: "caribe", nome: "Caribe", trecho: [673, 991], companhia: [1198, 1871], cias: [["Copa Airlines", "ConnectMiles"], ["LATAM", "LATAM Pass"], ["Azul", "TudoAzul"], ["GOL", "Smiles"]] },
    { id: "america-norte", nome: "América do Norte", trecho: [716, 1189], companhia: [1397, 1978], cias: [["American Airlines", "AAdvantage"], ["LATAM", "LATAM Pass"], ["Azul", "TudoAzul"], ["United", "MileagePlus"]] },
    { id: "europa", nome: "Europa", trecho: [987, 1592], companhia: [1896, 2695], cias: [["TAP", "Smiles"], ["Air France", "Smiles"], ["Iberia", "Avios"], ["LATAM", "LATAM Pass"], ["Turkish Airlines", "Miles&Smiles"]] },
    { id: "caros", nome: "Ásia e destinos mais distantes", trecho: [1896, 2367], companhia: [2964, 3789], cias: [["Qatar Airways", "Avios"], ["Emirates", "Smiles"], ["Turkish Airlines", "Miles&Smiles"]] },
  ];
  const CARIBE = new Set(["MX", "DO", "AW", "CW", "BS", "CU", "PA", "CR", "JM", "PR", "BB", "TT", "LC", "SX", "KY", "TC", "BZ", "GT", "HN", "NI", "SV", "HT", "AG", "VC", "GD", "DM", "KN", "MQ", "GP", "BQ", "VG", "VI", "AI", "MS"]);
  const EUROPA = new Set(["PT", "ES", "FR", "IT", "GB", "IE", "NL", "BE", "LU", "DE", "AT", "CH", "CZ", "SK", "PL", "HU", "SI", "HR", "BA", "RS", "ME", "MK", "AL", "GR", "BG", "RO", "MD", "UA", "BY", "LT", "LV", "EE", "FI", "SE", "NO", "DK", "IS", "MT", "CY", "MC", "AD", "SM", "VA", "LI", "RU", "TR"]);
  const AMERICA_SUL = new Set(["AR", "CL", "UY", "PY", "BO", "PE", "EC", "CO", "VE", "GY", "SR", "GF"]);
  function regiaoDe(d) {
    const iso = d.iso;
    if (iso === "BR") return "brasil";
    if (AMERICA_SUL.has(iso)) return "america-sul";
    if (CARIBE.has(iso)) return "caribe";
    if (iso === "US" || iso === "CA") return "america-norte";
    if (EUROPA.has(iso)) return "europa";
    if (iso) return "caros";
    if (d.lat == null) return "europa";
    if (d.lon < -30) return d.lat < 10 ? "america-sul" : "america-norte";
    return d.lon < 40 && d.lat > 35 ? "europa" : "caros";
  }
  function faixaDe(destino, origem) {
    const regiao = FAIXAS.find((f) => f.id === regiaoDe(destino));
    if (!origem || !origem.iso || origem.iso === "BR" || destino.lat == null || origem.lat == null) return regiao;
    // Saindo de fora do Brasil, a faixa vem da distância real do voo, usando as faixas do dono como régua (são as
    // distâncias típicas de cada região a partir de São Paulo): até 2.000 km = voo nacional; até 4.500 = América do
    // Sul; até 6.500 = Caribe; até 8.500 = América do Norte; até 10.500 = Europa; acima = Ásia. Assim Tóquio → Bangkok
    // (4.600 km) custa como Brasil → Caribe e Tóquio → Rio (18.500 km) como Brasil → Ásia. Bate com as médias de
    // mercado em dólar (voo curto ~US$ 150–350, médio ~US$ 300–700, longo ~US$ 700–1.400 ida e volta).
    const km = distanciaKm(origem, destino);
    const id = km < 2000 ? "brasil" : km < 4500 ? "america-sul" : km < 6500 ? "caribe" : km < 8500 ? "america-norte" : km < 10500 ? "europa" : "caros";
    // Companhias das duas pontas; GOL e Azul só com o Brasil numa ponta, LATAM só com a América do Sul.
    const pontas = [regiao.id, regiaoDe(origem)];
    const vistas = new Set();
    const cias = pontas.flatMap((p) => FAIXAS.find((f) => f.id === p).cias).filter(([c]) => {
      if (vistas.has(c)) return false;
      vistas.add(c);
      if (c === "GOL" || c === "Azul") return pontas.includes("brasil");
      if (c === "LATAM") return pontas.includes("brasil") || pontas.includes("america-sul");
      return true;
    });
    return { ...FAIXAS.find((f) => f.id === id), cias };
  }
  // Preço da promoção por trecho: dentro da faixa da região, sempre variando; no Brasil, quanto mais longe, mais caro.
  function precoTrecho(destino, origem) {
    const f = faixaDe(destino, origem);
    const [a, b] = f.trecho;
    let t = 0.1 + Math.random() * 0.8;
    if (f.id === "brasil" && destino.lat != null && origem && origem.lat != null && !origem.iso) t = Math.min(distanciaKm(origem, destino) / 3200, 1) * 0.65 + Math.random() * 0.35;
    return quebrado(a + (b - a) * t);
  }
  // Arredonda pro real e foge de final 0 ou 5 (R$ 573, nunca R$ 570 ou R$ 575).
  function quebrado(n) {
    let x = Math.round(n);
    if (x % 5 === 0) x += 1 + Math.floor(Math.random() * 4);
    return x;
  }
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  // Datas no formato do grupo: "Nov/26: 11, 12, 13" (mês/ano: dias), uma linha por mês.
  function linhasDeDatas(datas) {
    const porMes = new Map();
    for (const d of [...datas].sort((a, b) => a - b)) {
      const k = MESES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2);
      if (!porMes.has(k)) porMes.set(k, []);
      porMes.get(k).push(String(d.getDate()).padStart(2, "0"));
    }
    return [...porMes].map(([k, dias]) => k + ": " + dias.join(", ")).join("\n");
  }
  // Nome das milhas como aparece no grupo ("18.000 milhas Latam por trecho").
  const NOME_MILHAS = { LATAM: "Latam", GOL: "Smiles", Azul: "Azul" };
  function gerarPromoSimulada(destino, origem, quando) {
    let o = { cidade: origem.cidade || origem.texto, iata: origem.iata };
    if (destino.iata && o.iata === destino.iata) o = destino.iata === "GRU" ? { cidade: "Rio de Janeiro", iata: "GIG" } : { cidade: "São Paulo", iata: "GRU" };
    const f = faixaDe(destino, origem);
    const sorte = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const [cia, programa] = f.cias[hash(destino.nome + o.iata) % f.cias.length];
    const dinheiro = precoTrecho(destino, origem);
    const milhas = Math.max(500, Math.round((dinheiro / 24) * 1000 / 500) * 500);
    // Datas: sempre de 2 a 4 meses seguidos, com 9 a 18 datas de ida e 9 a 18 de volta em cada mês, nunca no passado.
    //   fim de ano / virada / Natal → começa em novembro ou dezembro e sempre inclui dezembro e janeiro;
    //   mês escolhido → começa no mês anterior ou no próprio e sempre inclui o mês escolhido;
    //   "o quanto antes" → começa no mês atual (a partir de amanhã); sem data → começa no mês que vem.
    //   Com um dia escolhido, ele entra na ida (e a volta, uma semana depois).
    const hoje = new Date();
    const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
    let quantosMeses = sorte(2, 4);
    let inicio;
    if (quando && quando.festas) inicio = new Date(quando.mes.getFullYear(), 11 - sorte(0, 1), 1);
    else if (quando && quando.mes && !quando.asap) inicio = new Date(quando.mes.getFullYear(), quando.mes.getMonth() - (quando.texto === "do meio do ano" ? 0 : sorte(0, 1)), 1);
    else if (quando && quando.asap) inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    else inicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    if (new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0) < amanha) inicio = new Date(amanha.getFullYear(), amanha.getMonth(), 1);
    // fim de ano começando em novembro precisa de 3 meses pra pegar dezembro e janeiro
    if (quando && quando.festas && inicio.getMonth() === 10) quantosMeses = Math.max(quantosMeses, 3);
    const diasDoMes = (mes) => {
      const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      const possiveis = [];
      for (let d = 1; d <= ultimo; d++) { const x = new Date(mes.getFullYear(), mes.getMonth(), d); if (x >= amanha) possiveis.push(x); }
      const quantos = Math.min(sorte(9, 18), possiveis.length);
      for (let i = possiveis.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [possiveis[i], possiveis[j]] = [possiveis[j], possiveis[i]]; }
      return possiveis.slice(0, quantos);
    };
    const ida = [], volta = [];
    for (let m = 0; m < quantosMeses; m++) {
      const mes = new Date(inicio.getFullYear(), inicio.getMonth() + m, 1);
      ida.push(...diasDoMes(mes));
      volta.push(...diasDoMes(mes));
    }
    const limiteFuturo = new Date(hoje.getFullYear() + 2, hoje.getMonth(), 1);
    if (quando && quando.dia && quando.dia >= amanha && quando.dia < limiteFuturo) {
      const d = quando.dia, v = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
      if (!ida.some((x) => x.getTime() === d.getTime())) ida.push(d);
      if (!volta.some((x) => x.getTime() === v.getTime())) volta.push(v);
    }
    return { origem: o, destino: { cidade: destino.cidadeVoo || destino.cidade, iata: destino.iata, bandeira: destino.bandeira }, classe: "ECONOMICA", cia, programa, milhasIda: milhas, milhasVolta: milhas, dinheiroTrecho: dinheiro, nomeMilhas: NOME_MILHAS[cia] || programa, ida, volta, hora: new Date(Date.now() - sorte(41, 58) * 60000), foto: destino.foto, alt: "Foto de " + destino.cidade, simulada: true };
  }
  async function buscarPromoReal(destino, origem) {
    if (!C.PROMOS_API_URL) return null;
    try {
      const url = new URL(C.PROMOS_API_URL, location.href);
      url.searchParams.set("destino", destino.cidade);
      if (destino.iata) url.searchParams.set("destino_iata", destino.iata);
      url.searchParams.set("origem", origem.iata);
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) return null;
      const p = await r.json();
      return {
        origem: { cidade: p.origem_cidade, iata: p.origem_iata }, destino: { cidade: p.destino_cidade, iata: p.destino_iata, bandeira: p.destino_bandeira || destino.bandeira },
        classe: p.classe || "ECONOMICA", cia: p.companhia, programa: p.programa, milhasIda: p.milhas_ida, milhasVolta: p.milhas_volta,
        ida: (p.datas_ida || []).map((x) => new Date(x + "T12:00")), volta: (p.datas_volta || []).map((x) => new Date(x + "T12:00")),
        dinheiroTrecho: p.dinheiro_trecho, precoCompanhiaTrecho: p.preco_companhia_trecho, nomeMilhas: p.nome_milhas || NOME_MILHAS[p.companhia] || p.programa,
        hora: new Date(p.enviada_em), foto: p.imagem_url || destino.foto, alt: "Foto de " + p.destino_cidade, simulada: false,
      };
    } catch (e) { return null; }
  }
  const milhar = (n) => Number(n).toLocaleString("pt-BR");
  const dinheiro = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function htmlPromo(p) {
    const hora = p.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const rotulo = (t) => "<b>" + t + "</b>";
    const texto =
      rotulo("🌟 Classe de Viagem :") + " " + esc(p.classe) + "\n\n" +
      rotulo("🗺️ Origem :") + " " + esc(p.origem.cidade) + " (" + esc(p.origem.iata) + ") ✈️ " + rotulo("Destino :") + " " + esc(p.destino.cidade) + (p.destino.iata ? " (" + esc(p.destino.iata) + ")" : "") + " " + (p.destino.bandeira || "") + "\n\n" +
      rotulo("🏢 Companhia Aérea :") + " " + esc(p.cia) + "\n" +
      rotulo("🔁 Tipo de viagem :") + " Ida e Volta\n\n" +
      rotulo("📅 Datas de ida :") + "\n" + linhasDeDatas(p.ida) + "\n\n" +
      rotulo("📅 Datas de volta :") + "\n" + linhasDeDatas(p.volta) + "\n\n" +
      rotulo("💵 Valor em dinheiro :") + " R$ " + dinheiro(p.dinheiroTrecho) + " por trecho" +
      (p.semMilhas ? "" : "\n" + rotulo("🪙 Valor em milhas :") + " " + milhar(p.milhasIda) + " milhas " + esc(p.nomeMilhas) + " por trecho");
    return '<div class="zap-linha"><img class="zap-avatar" src="midia/logo-avatar.png" width="32" height="32" alt=""><div class="zap-msg">' +
      '<div class="zap-topo"><span class="zap-nome">' + esc(C.PROMO_REMETENTE || "Central de Voos") + "</span></div>" +
      '<div class="zap-img"><img src="' + esc(p.foto) + '" alt="' + esc(p.alt || "") + '"></div>' +
      '<div class="zap-texto">' + texto + '<span class="zap-hora">' + hora + "</span></div></div></div>";
  }
  // Créditos das fotos dos destinos (as licenças CC BY e CC BY-SA pedem o nome do autor): no rodapé, num link discreto.
  const fotosUsadas = new Set();
  const rodape = document.getElementById("creditos");
  if (rodape) rodape.addEventListener("click", async () => {
    const lista = document.getElementById("lista-creditos");
    if (!lista.hidden) { lista.hidden = true; return; }
    try {
      const creditos = await fetch("midia/destinos/credits.json").then((r) => r.json());
      const usados = creditos.filter((c) => !fotosUsadas.size || fotosUsadas.has(c.file));
      lista.innerHTML = usados.map((c) => '<li><a href="' + esc(c.page) + '" target="_blank" rel="noopener">' + esc(c.credit || c.title) + "</a></li>").join("");
    } catch (e) { lista.innerHTML = "<li>Fotos de acervos abertos (Wikimedia Commons).</li>"; }
    lista.hidden = false;
  });
  async function mostrarPromo(destino, origem, quando, semMilhas) {
    let p = null;
    if (C.PROMOS_FONTE === "api") p = await buscarPromoReal(destino, origem);
    else p = gerarPromoSimulada(destino, origem, quando);
    if (!p) return null; // sem promoção real, não mostra nada (nunca cai pra simulada no modo "api")
    p.semMilhas = !!semMilhas;
    const cidade = p.destino.cidade;
    // Lugar sem aeroporto (Gramado → Porto Alegre): deixa claro que o voo é pro aeroporto mais perto do destino.
    const perto = destino.cidade && tirarAcento(destino.cidade) !== tirarAcento(cidade) ? ", o aeroporto mais perto de *" + destino.cidade + "*" : "";
    await ele("Achei! Olha essa promoção saindo de *" + p.origem.cidade + "* pra *" + cidade + "*" + perto + ", que enviamos direto na *Comunidade VIP* *na última hora*, com várias datas 👇");
    const el = await eleHtml(htmlPromo(p), "zap", 1100);
    el.querySelector(".zap-img img").addEventListener("load", rolar);
    fotosUsadas.add(p.foto);
    registrar("promo_exemplo", { destino: destino.cidade, origem: p.origem.iata, fonte: p.simulada ? "simulada" : "api" });
    return p;
  }
  // Valor vendido no site das companhias aéreas, por trecho e por pessoa (média por faixa; fixo pra mesma rota).
  function precoCompanhiaTrecho(destino, faixa, promoTrecho) {
    const [a, b] = faixa.companhia;
    const nome = destino.cidade || destino.nome || "";
    const v = a + (hash(nome + faixa.id) % (b - a + 1));
    let c = Math.round(Math.min(b, Math.max(v, promoTrecho * 1.45 + (hash(nome) % 60))));
    while (c % 5 === 0 || Math.round(c - promoTrecho) % 5 === 0) c--;
    return c;
  }
  // Destinos que todo mundo conhece: só eles entram na tabela além do destino da pessoa (nada de Playa del Carmen).
  const FAMOSOS = new Set([
    "Rio de Janeiro", "São Paulo", "Salvador", "Fortaleza", "Recife", "Natal", "Maceió", "Florianópolis", "Porto Seguro", "Porto de Galinhas",
    "Fernando de Noronha", "Foz do Iguaçu", "Gramado", "Jericoacoara", "João Pessoa", "Búzios", "Balneário Camboriú", "Manaus", "Bonito",
    "Santiago", "Buenos Aires", "Bariloche", "Lima", "Cusco", "Machu Picchu", "Montevidéu", "Punta del Este", "Cartagena", "Mendoza", "Ushuaia",
    "Cancún", "Punta Cana", "Aruba", "Curaçao", "Cidade do México",
    "Orlando", "Miami", "Nova York", "Las Vegas", "Los Angeles", "São Francisco", "Washington", "Toronto",
    "Lisboa", "Porto", "Paris", "Roma", "Madri", "Barcelona", "Londres", "Amsterdã", "Milão", "Veneza", "Florença", "Berlim", "Praga", "Santorini", "Atenas", "Istambul",
    "Dubai", "Abu Dhabi", "Doha", "Tóquio", "Maldivas", "Bangkok", "Bali", "Phuket", "Cairo", "Cidade do Cabo", "Singapura", "Sydney",
  ]);
  // A tabela de promoções do fechamento: o destino da pessoa primeiro (o mesmo valor do print), mais 2 ou 3 da
  // mesma região e alguns de outras regiões. Valores ida e volta, por pessoa.
  function tabelaPromocoes(destino, origem, promo, faixa) {
    const linhas = [];
    const vip = promo ? promo.dinheiroTrecho : precoTrecho(destino, origem);
    linhas.push({ nome: destino.cidade, bandeira: destino.bandeira, vip: vip * 2, cia: precoCompanhiaTrecho(destino, faixa, vip) * 2, sua: true });
    const usados = new Set([tirarAcento(destino.cidade), tirarAcento(destino.cidadeVoo || ""), tirarAcento(destino.nome || "")]);
    // A cidade de saída não entra na tabela (saindo de Paris, Paris não é destino).
    if (origem) [origem.cidade, origem.digitada].filter(Boolean).forEach((n) => usados.add(tirarAcento(n)));
    // Todas as linhas saem da mesma cidade da pessoa (saindo de Tóquio, Bangkok é perto e barato; o Rio, longe e caro).
    const linhaDe = (m) => { const v = precoTrecho(m, origem); usados.add(tirarAcento(m.nome)); return { nome: m.nome, bandeira: bandeiraDe(m.iso), vip: v * 2, cia: precoCompanhiaTrecho(m, faixaDe(m, origem), v) * 2 }; };
    const comAeroporto = MUNDO.filter((m) => m.nome !== "Nordeste" && m.iata && MUNDO.find((x) => x.iata === m.iata) === m);
    // O parecido: o destino da mesma região mais perto do escolhido (Dubai → Doha, Recife → Fortaleza).
    if (destino.lat != null) {
      const parecido = comAeroporto.filter((m) => FAMOSOS.has(m.nome) && regiaoDe(m) === regiaoDe(destino) && !usados.has(tirarAcento(m.nome)) && m.lat != null)
        .map((m) => ({ m, km: distanciaKm(destino, m) })).filter((x) => x.km > 50).sort((a, b) => a.km - b.km)[0];
      if (parecido) linhas.push(linhaDe(parecido.m));
    }
    // Um destino conhecido de cada outra região, na ordem de sempre (nacional, América do Sul, Caribe, América do Norte, Europa, Ásia).
    const VITRINE = {
      brasil: ["Rio de Janeiro", "Salvador", "Florianópolis", "Natal", "Porto Seguro", "Maceió"],
      "america-sul": ["Santiago", "Buenos Aires", "Bariloche", "Lima", "Montevidéu"],
      caribe: ["Cancún", "Punta Cana", "Aruba", "Curaçao"],
      "america-norte": ["Orlando", "Miami", "Nova York", "Las Vegas"],
      europa: ["Lisboa", "Paris", "Roma", "Madri", "Londres"],
      caros: ["Dubai", "Tóquio", "Maldivas", "Bangkok"],
    };
    for (const f of FAIXAS) {
      if (f.id === regiaoDe(destino)) continue;
      const nomes = VITRINE[f.id].filter((n) => !usados.has(tirarAcento(n)));
      const escolhido = nomes[Math.floor(Math.random() * nomes.length)];
      const m = MUNDO.find((x) => x.nome === escolhido);
      if (m) linhas.push(linhaDe(m));
    }
    return linhas;
  }
  const sorte = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  async function cartaoEconomia(p, destino, faixa) {
    const pessoas = dados.pessoas;
    const naPromo = p.dinheiroTrecho * 2 * pessoas;
    const cia = p.precoCompanhiaTrecho || precoCompanhiaTrecho(destino, faixa, p.dinheiroTrecho);
    const normal = cia * 2 * pessoas;
    const economia = normal - naPromo;
    registrar("resultado", { destino: destino.cidade, faixa: faixa.id, pessoas, milhas: dados.milhas, onde: dados.ondeCompra, origem: p.origem.iata, economia });
    const quem = pessoas === 1 ? "pra você" : "pra " + pessoas + (pessoas === 4 ? " ou mais pessoas" : " pessoas");
    const ciaPessoa = normal / pessoas, vipPessoa = naPromo / pessoas;
    const bloco = (titulo, cia, vip) =>
      '<div class="bloco-preco"><div class="bloco-titulo">' + titulo + "</div>" +
      '<div class="bloco-linha"><span>Nas companhias aéreas</span><span class="de">' + reais(cia) + "</span></div>" +
      '<div class="bloco-linha vip"><span>No VIP</span><span class="por">' + reais(vip) + "</span></div></div>";
    await digitando(1100);
    const res = linha("ele",
      '<p class="titulo">Sua economia nessa promoção</p>' +
      bloco("Ida e volta, por pessoa", ciaPessoa, vipPessoa) +
      (pessoas > 1 ? bloco("Ida e volta, " + quem, normal, naPromo) : "") +
      '<div class="rotulo">' + (pessoas > 1 ? "Juntando todo mundo, vocês economizam" : "Você economiza") + '</div>' +
      '<div class="numero" aria-live="off"><small>R$</small><span>0</span></div>' +
      '<div class="letra-mida">Preço nas companhias aéreas: média do valor vendido no site das companhias pra essa rota, nas mesmas datas.</div>',
      "cartao resultado"
    );
    contar(res.querySelector(".numero span"), economia);
    await digitando(4500);
    const frase = economia < 700 ? "Já dá pra pagar os passeios da viagem 😄" : economia < 2500 ? "Dá pra pagar a hospedagem e os passeios 😄" : "Dá pra pagar o hotel, os passeios e ainda sobra 😄";
    await ele("Isso é o que fica no seu bolso, *" + dados.nome + "*. " + frase);
  }

  // Quando a pessoa pretende viajar, escrito do jeito dela. Devolve { mes, dia, texto }, null (não sabe) ou undefined (não entendeu).
  const NOMES_MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function lerQuando(bruto) {
    const t = tirarAcento(bruto);
    if (/\b(nao sei|sei la|nao tenho|qualquer|tanto faz|sem data|ainda nao|indiferente)\b/.test(t)) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const anoQueVem = /\b(ano que vem|proximo ano|ano seguinte)\b/.test(t);
    const anoDe = (m, d, anoEscrito) => {
      if (anoEscrito) return anoEscrito < 100 ? 2000 + anoEscrito : anoEscrito;
      if (anoQueVem) return hoje.getFullYear() + 1;
      const tentativa = new Date(hoje.getFullYear(), m, d || 28);
      return tentativa < hoje ? hoje.getFullYear() + 1 : hoje.getFullYear();
    };
    const pronto = (m, d, anoEscrito) => {
      const ano = anoDe(m, d, anoEscrito);
      const mes = new Date(ano, m, 1);
      if (d) {
        const dia = new Date(ano, m, d);
        if (dia.getMonth() !== m) return undefined;
        return { mes, dia, texto: dia.toLocaleDateString("pt-BR", { day: "numeric", month: "long" }) };
      }
      return { mes, dia: null, texto: NOMES_MESES[m].replace("marco", "março") };
    };
    const cru = String(bruto).toLowerCase();
    let x = cru.match(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4}))?\b/);
    if (x && +x[2] >= 1 && +x[2] <= 12 && +x[1] >= 1 && +x[1] <= 31) return pronto(+x[2] - 1, +x[1], x[3] ? +x[3] : 0);
    x = cru.match(/\b(\d{1,2})\s*[\/.-]\s*(\d{4})\b/);
    if (x && +x[1] >= 1 && +x[1] <= 12) return pronto(+x[1] - 1, 0, +x[2]);
    if (/\b(semana que vem|proxima semana)\b/.test(t)) { const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7); return pronto(d.getMonth(), d.getDate(), d.getFullYear()); }
    if (/\b(mes que vem|proximo mes)\b/.test(t)) { const d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1); return pronto(d.getMonth(), 0, d.getFullYear()); }
    const mesIdx = NOMES_MESES.findIndex((n) => new RegExp("\\b(" + n + (n === "dezembro" || n === "marco" ? "" : "|" + n.slice(0, 3)) + ")\\b").test(t));
    if (mesIdx >= 0) {
      x = t.match(/\b(\d{1,2})\b(?!\s*\d)/);
      const ano = (t.match(/\b(20\d{2})\b/) || [])[1];
      const dia = x && +x[1] >= 1 && +x[1] <= 31 && +x[1] !== +ano ? +x[1] : 0;
      return pronto(mesIdx, dia, ano ? +ano : 0);
    }
    if (/\b(mais rapido|o quanto antes|quanto antes|logo|urgente|ja|agora|imediato|esse mes|este mes|nesse mes|neste mes|asap)\b/.test(t)) {
      return { mes: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1), dia: null, texto: "dos próximos dias", asap: true };
    }
    if (/\b(ferias do meio do ano|ferias de julho|ferias escolares|inverno)\b/.test(t)) return pronto(6, 0, 0);
    if (/\b(fim de ano|fim do ano|final de ano|final do ano|virada|reveillon|reveilon|natal|ano novo|festas)\b/.test(t)) return { ...pronto(11, 0, 0), festas: true, texto: "do fim de ano" };
    if (/\bpascoa\b/.test(t)) return pronto(2, 0, 0);
    if (/\b(meio do ano|metade do ano|meados do ano|segundo semestre)\b/.test(t)) return { ...pronto(5, 0, 0), texto: "do meio do ano" };
    if (/\b(comeco do ano|inicio do ano|primeiro semestre)\b/.test(t)) return { ...pronto(0, 0, 0), texto: "do começo do ano" };
    if (/\b(ferias de janeiro|verao|ferias de verao)\b/.test(t)) return pronto(0, 0, 0);
    if (/\bcarnaval\b/.test(t)) return pronto(1, 0, 0);
    if (/\bferias\b/.test(t)) return pronto(6, 0, 0);
    return undefined;
  }
  async function perguntaQuando() {
    for (let tentativa = 0; ; tentativa++) {
      const bruto = await campoTexto({ nome: "quando", placeholder: "Ex.: janeiro, 15/01, fim do ano…", rotulo: "Quando você pretende viajar", atalhos: ["Fim de ano", "Férias de janeiro", "Carnaval", "Férias de julho", "Ainda não sei"] });
      eu(bruto);
      const q = lerQuando(bruto);
      registrar("resposta", { resposta: "quando:" + bruto });
      if (q) return q;
      if (q === null || tentativa >= 1) {
        // Não sabe a data: procura nas próximas férias escolares (janeiro; de fevereiro a junho, julho).
        const hoje = new Date(), m = hoje.getMonth();
        const julho = m <= 5;
        const ferias = { mes: new Date(hoje.getFullYear() + (julho ? 0 : 1), julho ? 6 : 0, 1), dia: null, texto: julho ? "das férias de julho" : "das férias de janeiro", ferias: true };
        await ele("Sem problemas! Então vou procurar datas nas *" + ferias.texto.slice(4) + "*, que é quando a maioria das pessoas viaja 😉");
        return ferias;
      }
      await ele("Não entendi direitinho 😅 Pode escrever o mês (ex.: *janeiro*) ou a data (ex.: *15/01*)? Se ainda não sabe, escreve *não sei*.");
    }
  }

  // Cidade de saída escrita: a cidade com aeroporto da lista, ou o aeroporto grande mais próximo da cidade escrita.
  // Tira o jeito de falar ("perto de", "moro em", "região de", "grande", "e região", "interior de"...) e fica só o lugar.
  function limparLocal(t) {
    let x = " " + t + " ";
    for (let i = 0; i < 3; i++) {
      x = x.replace(/^ (eu )?(moro|vivo|sou|saio|fico|estou|to|tou|resido|trabalho)( aqui)?( la)? (em|de|da|do|no|na|nos|nas|pra|para|perto|proximo|proxima|ao lado)? ?/, " ");
      x = x.replace(/^ (zona|regiao|lado) (sul|norte|leste|oeste|central|centro|metropolitana)( do| da| de)? /, " ");
      x = x.replace(/^ (bem |mais ou menos |aqui )?(perto|pertinho|proximo|proxima|ao lado|do lado|vizinho|vizinha|regiao metropolitana|regiao|interior|litoral|cidade|municipio|grande)( do| da| de| dos| das| a| ao)? /, " ");
      x = x.replace(/^ (de|da|do|em|no|na|a|o) /, " ");
    }
    x = x.replace(/ (e regiao|e arredores|regiao|e proximidades|capital|cidade|centro|interior|aqui)+ $/, " ");
    return x.trim() || t;
  }
  async function resolverOrigem(texto) {
    const t = expandirSigla(limparLocal(tirarAcento(texto)));
    // Cidade de fora do Brasil que está na lista do mundo: sai do aeroporto dela.
    const fora = INDICE.get(t) || (t.length === 3 && MUNDO.find((m) => m.iata && m.iata.toLowerCase() === t));
    if (fora && fora.iso !== "BR" && fora.iata) return origemDeFora(fora);
    for (const [iata, a] of Object.entries(AEROPORTOS)) if (tirarAcento(a[0]) === t || t === iata.toLowerCase()) return { texto: a[0], cidade: a[0], iata, lat: a[1], lon: a[2] };
    let ponto = null;
    const conhecido = INDICE.get(t) || MUNDO.find((m) => m.iso === "BR" && m.iata && m.iata.toLowerCase() === t);
    if (conhecido && conhecido.iso === "BR") ponto = { lat: conhecido.lat, lon: conhecido.lon, nome: conhecido.nome };
    if (!ponto) {
      try {
        const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=10&language=pt&format=json&name=" + encodeURIComponent(t), { signal: ctrl.signal });
        const j = await r.json();
        const g = (j.results || []).find((x) => x.country_code === "BR") || (j.results || [])[0];
        // Lugar de fora do Brasil fora da lista: sai da cidade com aeroporto mais perto, na lista do mundo.
        if (g && g.country_code !== "BR") {
          let perto = null;
          for (const m of MUNDO) {
            if (!m.iata || m.iso === "BR" || m.lat == null || SEM_AEROPORTO.has(m.nome)) continue;
            const km = distanciaKm({ lat: g.latitude, lon: g.longitude }, m);
            if (!perto || km < perto.km) perto = { km, m };
          }
          if (perto) return { ...origemDeFora(perto.m), digitada: g.name, km: Math.round(perto.km) };
        }
        if (g) ponto = { lat: g.latitude, lon: g.longitude, nome: g.name };
      } catch (e) { /* sem rede */ }
    }
    if (!ponto) return null;
    let melhor = null;
    for (const [iata, a] of Object.entries(AEROPORTOS)) {
      const km = distanciaKm(ponto, { lat: a[1], lon: a[2] });
      if (!melhor || km < melhor.km) melhor = { km, iata, a };
    }
    return { texto: melhor.a[0], cidade: melhor.a[0], iata: melhor.iata, lat: melhor.a[1], lon: melhor.a[2], digitada: ponto.nome, km: Math.round(melhor.km) };
  }

  function origemDeFora(m) {
    const cidade = cidadeDoAeroporto(m);
    return { texto: cidade, cidade, iata: m.iata, lat: m.lat, lon: m.lon, iso: m.iso, bandeira: bandeiraDe(m.iso), digitada: m.nome };
  }

  // Quando a pessoa escreve uma região, o Henrique fala dela e escolhe o destino mais procurado.
  const REGIOES_ESCRITAS = {
    nordeste: { destino: "Fortaleza", frase: "🏖️ O Nordeste é conhecido pelas praias paradisíacas, de água quentinha o ano inteiro! Um dos destinos mais procurados de lá é *Fortaleza*, então vou procurar as passagens pra lá ✈️" },
    europa: { destino: "Lisboa", frase: "🏰 A Europa é o sonho de muita gente, com cidades cheias de história em cada esquina! Uma das portas de entrada mais procuradas é *Lisboa*, então vou procurar as passagens pra lá ✈️" },
    caribe: { destino: "Punta Cana", frase: "🌴 O Caribe é sinônimo de mar azul-turquesa e areia branquinha! Um dos destinos mais procurados é *Punta Cana*, então vou procurar as passagens pra lá ✈️" },
    "estados unidos": { destino: "Orlando", frase: "🇺🇸 Os Estados Unidos têm destino pra todo gosto! Um dos mais procurados pelos brasileiros é *Orlando*, então vou procurar as passagens pra lá ✈️" },
    eua: { destino: "Orlando", frase: "🇺🇸 Os Estados Unidos têm destino pra todo gosto! Um dos mais procurados pelos brasileiros é *Orlando*, então vou procurar as passagens pra lá ✈️" },
    asia: { destino: "Tóquio", frase: "🏯 A Ásia é uma experiência completamente diferente de tudo! Um dos destinos mais procurados é *Tóquio*, então vou procurar as passagens pra lá ✈️" },
    "america do sul": { destino: "Santiago", frase: "🏔️ A América do Sul tem lugares incríveis pertinho do Brasil! Um dos destinos mais procurados é *Santiago*, então vou procurar as passagens pra lá ✈️" },
    "sul do brasil": { destino: "Gramado", frase: "🍷 O Sul do Brasil é charme puro, com serra, frio e boa comida! Um dos destinos mais procurados é *Gramado*, então vou procurar as passagens pra lá ✈️" },
    "serra gaucha": { destino: "Gramado", frase: "🍷 A Serra Gaúcha é charme puro, com frio e boa comida! O destino mais procurado de lá é *Gramado*, então vou procurar as passagens pra lá ✈️" },
  };

  // Sons do presente, gerados no próprio navegador (sem arquivo e sem direito autoral). Só tocam depois do toque
  // da pessoa (regra dos navegadores).
  function ruido(dur) {
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur)), buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buf; return src;
  }
  function tom(freq, t, dur, tipo, vol, freqFim) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(freq, t);
    if (freqFim) o.frequency.exponentialRampToValueAtTime(freqFim, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  // Rufar de tambor que acelera e cresce, com uma "pancada" grave a cada tremida da caixa.
  function somSuspense(segundos) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + 0.03;
    let t = 0;
    while (t < segundos) {
      const p = t / segundos, dur = 0.07;
      const n = ruido(dur), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
      f.type = "bandpass"; f.frequency.value = 900 + p * 500; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.02 + p * 0.09, t0 + t); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + dur);
      n.connect(f).connect(g).connect(audioCtx.destination); n.start(t0 + t);
      t += 0.085 - p * 0.05;
    }
    [0.15, 0.6, 1.0, 1.3, 1.55, 1.75].forEach((x) => { if (x < segundos) tom(110, t0 + x, 0.22, "sine", 0.22, 45); });
  }
  // A tampa estourando: um "pop" grave e um vento que sobe.
  function somAbrir() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + 0.01;
    tom(220, t, 0.18, "sine", 0.35, 55);
    const n = ruido(0.6), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    f.type = "bandpass"; f.Q.value = 1.4; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(f).connect(g).connect(audioCtx.destination); n.start(t);
  }
  // Brilho mágico enquanto o cupom sobe: uma cascata de sininhos agudos.
  function somBrilho() {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + 0.02, escala = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186];
    for (let i = 0; i < 16; i++) tom(escala[(i * 3) % escala.length], t0 + i * 0.055, 0.5, "sine", 0.045);
  }
  function somFanfarra() {
    if (!audioCtx) return;
    const notas = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [783.99, 0.56], [1046.5, 0.68]];
    for (const [f, d] of notas) {
      const t = audioCtx.currentTime + d, dur = d >= 0.68 ? 0.9 : 0.18;
      tom(f, t, dur, "triangle", 0.12);
      tom(f * 2, t, dur, "sine", 0.03);
    }
    // acorde final sustentado por baixo
    const t = audioCtx.currentTime + 0.68;
    [261.63, 329.63, 392].forEach((f) => tom(f, t, 1.3, "triangle", 0.05));
  }
  const vibrar = (p) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} };

  // O presente de Black Friday: a pessoa toca na caixa, ela treme cada vez mais forte, a tampa voa,
  // sai um facho de luz e o cupom de 55% OFF (o cupom do config) sobe de dentro da caixa.
  function presenteBlackFriday() {
    return new Promise(async (resolve) => {
      const caixaSvg =
        '<svg viewBox="0 0 200 190" aria-hidden="true">' +
        "<defs>" +
        '<linearGradient id="pr-corpo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a3a42"/><stop offset=".45" stop-color="#1c1c21"/><stop offset="1" stop-color="#0c0c0f"/></linearGradient>' +
        '<linearGradient id="pr-tampa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4a53"/><stop offset="1" stop-color="#1d1d22"/></linearGradient>' +
        '<linearGradient id="pr-fita" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b07d12"/><stop offset=".35" stop-color="#ffe89a"/><stop offset=".6" stop-color="#e2ad3b"/><stop offset="1" stop-color="#9a6b0e"/></linearGradient>' +
        '<linearGradient id="pr-laco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset=".55" stop-color="#e2ad3b"/><stop offset="1" stop-color="#a8770f"/></linearGradient>' +
        "</defs>" +
        '<g class="corpo">' +
        '<rect x="30" y="88" width="140" height="98" rx="7" fill="url(#pr-corpo)"/>' +
        '<rect x="30" y="88" width="140" height="10" fill="#000" opacity=".35"/>' +
        '<rect x="88" y="88" width="24" height="98" fill="url(#pr-fita)"/>' +
        '<rect x="34" y="100" width="3" height="78" rx="1.5" fill="#fff" opacity=".08"/>' +
        "</g>" +
        '<g class="tampa">' +
        '<rect x="22" y="64" width="156" height="30" rx="6" fill="url(#pr-tampa)"/>' +
        '<rect x="26" y="66" width="148" height="2.5" rx="1.25" fill="#fff" opacity=".14"/>' +
        '<rect x="86" y="64" width="28" height="30" fill="url(#pr-fita)"/>' +
        '<path d="M100 64 C84 34 50 30 52 50 C54 64 80 66 100 64 Z" fill="url(#pr-laco)"/>' +
        '<path d="M100 64 C116 34 150 30 148 50 C146 64 120 66 100 64 Z" fill="url(#pr-laco)"/>' +
        '<path d="M98 62 C86 46 66 42 64 50 C66 58 84 62 98 62 Z" fill="#8a5d08" opacity=".45"/>' +
        '<path d="M102 62 C114 46 134 42 136 50 C134 58 116 62 102 62 Z" fill="#8a5d08" opacity=".45"/>' +
        '<path d="M96 66 L82 92 L90 90 L94 98 L100 68 Z" fill="url(#pr-laco)"/>' +
        '<path d="M104 66 L118 92 L110 90 L106 98 L100 68 Z" fill="url(#pr-laco)"/>' +
        '<rect x="90" y="54" width="20" height="16" rx="6" fill="url(#pr-fita)"/>' +
        "</g>" +
        "</svg>";
      const faiscas = [[14, 30, 0], [84, 22, 0.6], [6, 70, 1.2], [92, 62, 0.3], [24, 12, 0.9], [74, 46, 1.5]]
        .map(([x, y, d]) => '<i class="faisca" style="left:' + x + "%;top:" + y + "%;animation-delay:" + d + 's"></i>').join("");
      const el = await cartao(
        '<div class="bf-faixa"><span>BLACK FRIDAY</span></div><p class="bf-titulo">Tem um presente esperando por você</p>' +
        '<div class="palco">' +
        '<div class="raios"></div><div class="halo"></div>' + faiscas +
        '<div class="facho"></div>' +
        '<div class="bilhete"><span class="b-topo">Presente de Black Friday</span><strong class="b-pct">55% OFF</strong><span class="b-linha"></span><span class="b-cupom">Cupom <b>' + esc(CUPOM) + "</b></span></div>" +
        '<span class="anel-toque" aria-hidden="true"></span><span class="mao-toque" aria-hidden="true">👆</span>' +
        '<div class="caixa-bf" role="button" tabindex="0" aria-label="Abrir o presente"><div class="flutua">' + caixaSvg + "</div></div>" +
        '<div class="clarao"></div>' +
        "</div>" +
        '<button type="button" class="bf-dica"><span class="bf-dica-mao" aria-hidden="true">👆</span> Toque pra abrir o presente</button>' +
        '<p class="revelado" hidden>Você ganhou o maior desconto da Black Friday! Use o cupom <b>' + esc(CUPOM) + "</b> pra entrar na Comunidade VIP.</p>",
        "cartao bf-cartao", 800
      );
      const palco = el.querySelector(".palco"), caixa = el.querySelector(".caixa-bf"), bilhete = el.querySelector(".bilhete"),
        dica = el.querySelector(".bf-dica"), revelado = el.querySelector(".revelado");
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      let abriu = false;
      async function abrir() {
        if (abriu) return;
        abriu = true;
        registrar("abriu_presente", {});
        destravarSom();
        try { if (audioCtx) await Promise.race([audioCtx.resume(), espera(300)]); } catch (e) {}
        dica.classList.add("some");
        cartaoBf.classList.remove("tocavel");
        caixa.removeAttribute("role"); caixa.removeAttribute("tabindex");
        // 1. Suspense: a caixa treme cada vez mais forte.
        palco.classList.add("tremendo");
        somSuspense(1.9);
        vibrar([30, 260, 30, 160, 40, 90, 50, 60, 60]);
        await espera(1900);
        // 2. A tampa voa, clarão, raios de luz e confete.
        palco.classList.remove("tremendo");
        palco.classList.add("aberto");
        somAbrir();
        vibrar(80);
        const cores = ["#f2c14e", "#ffe89a", "#e8323a", "#ffffff", "#d9a227", "#fff4d2"];
        for (let i = 0; i < 80; i++) {
          const c = document.createElement("i");
          c.className = "confete" + (i % 4 === 0 ? " estrela" : "");
          const ang = (-90 + (Math.random() * 150 - 75)) * (Math.PI / 180), dist = 120 + Math.random() * 190;
          c.style.setProperty("--x", Math.cos(ang) * dist + "px");
          c.style.setProperty("--y", Math.sin(ang) * dist + 60 + "px");
          c.style.setProperty("--r", Math.round(Math.random() * 720 - 360) + "deg");
          c.style.background = cores[i % cores.length];
          c.style.animationDelay = Math.random() * 180 + "ms";
          palco.appendChild(c);
        }
        setTimeout(() => palco.querySelectorAll(".confete").forEach((c) => c.remove()), 2200);
        // 3. O cupom sobe de dentro da caixa e vem pra frente.
        await espera(220);
        bilhete.classList.add("saindo");
        somBrilho();
        await espera(700);
        bilhete.classList.add("revelou");
        somFanfarra();
        await espera(800);
        revelado.hidden = false;
        rolar();
        await espera(1600);
        resolve();
      }
      const cartaoBf = el.querySelector(".bf-cartao");
      cartaoBf.classList.add("tocavel");
      cartaoBf.addEventListener("click", abrir);
      caixa.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });
      rolar();
    });
  }

  // ---------- roteiro ----------
  async function roteiro() {
    registrar("inicio", {});
    TOTAL = origemPorTelefone() ? 7 : 8;
    etapa(0);
    await esperar(500);
    // Só no modo teste: ?teste=1&ir=presente pula direto pro presente de Black Friday.
    if (teste && params.get("ir") === "presente") { dados.nome = "Teste"; await presenteBlackFriday(); return; }

    // Abertura: boas-vindas, o diagnóstico e a promessa do fim (texto do dono, 17/10/2026).
    const aberturaVersao = EXP && EXP.variantes && EXP.variantes[variante] && EXP.variantes[variante].abertura;
    const abertura = Array.isArray(aberturaVersao) && aberturaVersao.length ? aberturaVersao : [
      txt("abertura1", "✈️ Oii, que bom que você veio! Eu preparei um *diagnóstico rápido* pra você: em *menos de 2 minutos*, você descobre *o quanto* pode economizar na sua *próxima viagem*!"),
      txt("abertura2", "E no final ainda te mostro como *pagar a metade do preço* nas passagens com a nossa Comunidade VIP. Bora??"),
    ];
    ajuste = -1000;
    for (let i = 0; i < abertura.length; i++) await ele(String(abertura[i]), i === 0 ? 1100 : undefined);
    ajuste = 0;
    await opcoes([{ texto: txt("botaoAbertura", "SIM, Claro!"), principal: true }]);
    registrar("aceitou", {});

    // Somado ao fluxo: o nome, pra conversa ficar pessoal.
    if (NOME_LINK) dados.nome = NOME_LINK;
    else {
      await ele("Boa! Como posso te chamar?");
      dados.nome = await campoNome();
      eu(dados.nome);
    }
    etapa(1);

    // Onde compra.
    await ele((NOME_LINK ? "Boa, *" : "Prazer, *") + dados.nome + "*! Certo, antes de te explicar eu preciso saber...\n\n*Onde costuma comprar suas passagens?*");
    await dica("Caso você utilize outra opção, ou mais de uma opção listada, clique em \"Outra Opção\" 👇");
    const onde = await opcoes([{ texto: "Skyscanner" }, { texto: "Google Flights" }, { texto: "Site da empresa" }, { texto: "Outra Opção" }]);
    dados.ondeCompra = onde.texto;
    registrar("resposta", { pergunta: "onde_compra", valor: onde.texto });
    const award = "e essa tarifa award é a tarifa promocional mais em conta que existe";
    const europa = "faz uma passagem ida e volta pra Europa sair de R$4.438 pra R$2.341, por exemplo 😜";
    if (onde.texto === "Skyscanner") {
      await ele("Skyscanner... legal, vc não está tão mal rsrs");
      await ele("o problema do sky é que ele compara as tarifas comuns e acaba deixando de fora as tarifas AWARDS");
      await ele(award);
    } else if (onde.texto === "Google Flights") {
      await ele("Google Flights... legal, vc não está tão mal rsrs");
      await ele("o problema do Google Flights é que ele compara as tarifas comuns e acaba deixando de fora as tarifas AWARDS");
      await ele(award);
      await ele(europa);
    } else if (onde.texto === "Site da empresa") {
      await ele("Site da cia aérea... poxa, das três opções essa é a mais cara e menos vantajosa 🙁");
      await ele("vou te explicar pq...");
      await ele("o problema de comprar no site da cia é que lá ela sempre tenta te vender a passagem mais cara possível, buscando ter o maior lucro... deixando de fora as tarifas AWARDS");
      await ele(award);
      await ele(europa);
    } else {
      await ele("legal, vc não está tão mal, já está diferente da maioria");
      await ele("o problema é que você está vendo apenas as tarifas comuns e acaba deixando de fora as tarifas AWARDS");
      await ele(award);
      await ele(europa);
    }
    await foto(IMG.tarifaAward, "", "Exemplo de passagem com tarifa award");
    etapa(2);

    // Milhas.
    await ele("Você já tem milhas aéreas suficientes pra viajar?");
    const milhas = await opcoes([{ texto: "SIM muitas!" }, { texto: "SIM, poucas" }, { texto: "Não tenho nada" }]);
    dados.milhas = milhas.texto;
    registrar("resposta", { pergunta: "milhas", valor: milhas.texto });
    if (milhas.texto === "SIM muitas!") {
      await ele("Perfeito! Então você já consegue aproveitar as passagens com milhas..");
      await ele("O grande problema que você deve enfrentar então é encontrar essas passagens, que ficam escondidas para o destino que você quer, e na data que pode ir...");
      await ele("lembrando que você n pode demorar muito, pq essas promoções Awards acabam bem rápido");
      await ele("ainda bem que temos uma Comunidade VIP, lá são enviadas mais de 150 promoções todos os dias!");
      await opcoes([{ texto: "Quero saber mais!", principal: true }]);
    } else {
      if (milhas.texto === "SIM, poucas") {
        await ele("entendi... com poucas milhas talvez não dê pra trocar por passagens");
        await ele("no máximo um liquidificador 😐");
      } else {
        await ele("Caramba, ainda não? Você ta deixando de viajar de graça por isso");
      }
      await ele("mas tudo bem, conseguimos te ajudar");
      await ele("na nossa Comunidade VIP você pode comprar as passagens usando Cartão ou PIX, sem ter milhas");
      await ele("isso é incrível né? 😁");
      await opcoes([{ texto: "SIM vou viajar muito", principal: true }]);
      etapa(3);

      // A viagem dos sonhos do Henrique.
      await ele("Uhuul boraaa ✈️");
      await ele("Posso te mostrar quanto economizei na minha viagem dos sonhos? 😊✈️");
      await opcoes([{ texto: "Pode sim!", principal: true }]);
      calma = 1.5;
      await ele("olha isso! Primeiro vamos ver quanto estava custando no Google Flights... 👇");
      await foto(IMG.googleParis, "", "Busca no Google Flights: Rio de Janeiro para Paris");
      await ele("Passagem com o \"menor preço\" do Google do Rio de Janeiro para Paris custando 4.438 reais voando de LATAM");
      await ele("Agora vamos ver quanto eu paguei? 🤗");
      await foto(IMG.pagouParis, "", "Passagem que o Henrique comprou");
      await ele("Hahahah 2.341 reais ida e voltaaa 🎉");
      await ele("Foi uma viagem dos sonhos pra conhecer a Europa.... voando exatamente no mesmo voo da LATAM ✈️😊");
      await foto(IMG.viagemParis, "", "O Henrique em Paris");
      await video("videoHistoria");
      await ele("Porém, *pagando a metade do preço* 😎 Assim fica fácil ser feliz né?! rsrsrs");
      await ele("Viajando a gente até esquece dos problemas do dia a dia 😄");
      calma = 1;
      await opcoes([{ texto: "Preciso viajaar!", principal: true }]);
      await ele("Vamoos ✈️✈️✈️");
      await ele("Porém, como vc não tem muitas milhas ou não tem nada, a coisa certa pra você é a Comunidade VIP!");
      await ele("lá vc consegue usar essas promoções pagando com PIX ou Cartão de Crédito 🙏");
      await ele("posso te mostrar as diferenças entre o grupo grátis e a Comunidade Vip?");
      await opcoes([{ texto: "Pode sim!", principal: true }]);
    }
    etapa(3);

    // Grátis × VIP.
    await digitando(1200);
    linha("ele", '<div class="cols"><div class="col"><h4>Grupo Grátis</h4><ul>' + GRATIS.map((g) => '<li class="' + g[0] + '">' + esc(g[1]) + "</li>").join("") + "</ul></div></div>", "cartao comparar um");
    await digitando(2000);
    linha("ele", '<div class="cols"><div class="col vip"><h4>Comunidade Vip 👑</h4><ul>' + VIP.map((v) => '<li class="sim">' + esc(v) + "</li>").join("") + "</ul></div></div>", "cartao comparar um");
    await digitando(4000);
    linha("ele",
      '<div class="cols"><div class="col bonus-roxo"><h4>' + txt("bonusTitulo", "💥 E mais! Bônus de hoje") + '</h4><p class="bonus-sub">Que vão potencializar as suas economias:</p><ul>' +
      BONUS.map((b) => '<li class="sim"><span><b class="bonus-nome">' + b.icone + " " + b.titulo + "</b>" + b.texto + "</span></li>").join("") +
      '</ul><p class="bonus-rodape">Tudo isso <b>incluso</b> no VIP 👑</p></div></div>',
      "cartao comparar um bonus");
    await digitando(3000);
    await opcoes([{ texto: "Quero ser VIP", principal: true }]);
    etapa(4);

    // Prova.
    await ele("Boa!! ✈️ \ndeixa eu te mostrar o que realmente muda pra quem entra no Vip — aí você vai entender o motivo de tanta gente migrar no mesmo dia 👇");
    await foto(IMG.carlosSantiago, "Carlos está na comunidade VIP e viajou pra Santiago por R$ 852 ida e volta 🇨🇱🔥", "Depoimento do Carlos, que viajou para Santiago");
    await foto(IMG.julianaEgito, "Outro membro, Juliana foi para o Egito por R$ 3.576 ida e volta 🇪🇬", "Depoimento da Juliana, que viajou para o Egito");
    await ele("São mais de *17 mil clientes ativos* aproveitando as promoções da nossa Comunidade Vip todos os dias 🥰");
    await opcoes([{ texto: "Quero fazer parte!", principal: true }]);
    await ele("Legal");

    // Somado ao fluxo: destino, quando, quantas pessoas e de onde sai (pelo DDD do telefone do link).
    const origemDoTelefone = origemPorTelefone();
    TOTAL = origemDoTelefone ? 7 : 8;
    await ele(txt("perguntaDestino", "Como estamos no período da *Black Friday*, eu vou te dar um presente, {nome}, mas antes me conta: *para onde você quer viajar?* Pode ser qualquer lugar do mundo 🌎"));
    let digitado = await campoDestino();
    eu(digitado);
    while (/\b(nao sei|sei la|qualquer|tanto faz|nenhum|ainda nao|nao tenho|indiferente|sem destino)\b/.test(tirarAcento(digitado))) {
      await ele("Tudo bem! Escolhe um desses (ou escreve outro lugar) que eu te mostro como fica a economia 👇");
      digitado = await campoDestino();
      eu(digitado);
    }
    mostrarDigitando();
    const regiao = REGIOES_ESCRITAS[tirarAcento(digitado)];
    const destino = await resolverDestino(regiao ? regiao.destino : digitado);
    dados.destino = destino;
    registrar("resposta", { pergunta: "destino", valor: destino.cidade });
    etapa(5);
    if (regiao) await ele(regiao.frase);
    else await ele(destino.bandeira ? destino.bandeira + " " + destino.cidade + ", que sonho!" : destino.cidade + ", que sonho! ✈️");
    if (destino.cidadeVoo && tirarAcento(destino.cidadeVoo) !== tirarAcento(destino.cidade)) {
      await ele("Como " + destino.cidade + " não tem aeroporto, vou procurar as passagens até o mais perto: *" + destino.cidadeVoo + (destino.iata ? " (" + destino.iata + ")" : "") + "* ✈️");
    }
    await ele("E *quando* você pretende viajar?");
    const quando = await perguntaQuando();
    dados.quando = quando;
    registrar("resposta", { pergunta: "quando", valor: !quando ? "Sem data" : quando.asap ? "O quanto antes" : quando.festas ? "Fim de ano" : quando.mes ? NOMES_MESES[quando.mes.getMonth()].replace("marco", "março").replace(/^./, (c) => c.toUpperCase()) : "Sem data" });
    etapa(6);
    await ele("E *quantas pessoas* costumam viajar com você, contando você?");
    const pessoas = await opcoes([{ valor: 1, texto: "Só eu" }, { valor: 2, texto: "2 pessoas" }, { valor: 3, texto: "3 pessoas" }, { valor: 4, texto: "4 ou mais" }]);
    dados.pessoas = pessoas.valor;
    registrar("resposta", { pergunta: "pessoas", valor: pessoas.texto });
    etapa(7);
    let origem = origemDoTelefone;
    if (!origem) {
      await ele("E *de qual cidade* você costuma sair?");
      for (let tentativa = 0; !origem; tentativa++) {
        const bruto = await campoTexto({ nome: "origem", placeholder: "Sua cidade", rotulo: "Cidade de saída", sugestoes: Object.values(AEROPORTOS).map((a) => a[0]) });
        eu(bruto);
        mostrarDigitando();
        origem = await resolverOrigem(bruto);
        if (!origem && tentativa >= 1) origem = { texto: "São Paulo", cidade: "São Paulo", iata: "GRU", lat: -23.43, lon: -46.47 };
        else if (!origem) await ele("Não achei essa cidade 😅 Pode escrever de novo, com o nome completo?");
      }
      if (origem.digitada && tirarAcento(origem.digitada) !== tirarAcento(origem.cidade)) await ele("Perfeito! O aeroporto " + (origem.iso ? "" : "grande ") + "mais perto de " + origem.digitada + " é o de *" + origem.cidade + " (" + origem.iata + ")*. Vou procurar saindo de lá ✈️");
      etapa(8);
    }
    if (destino.iata && destino.iata === origem.iata) {
      const alt = origem.iata === "GRU" ? "GIG" : "GRU", a = AEROPORTOS[alt];
      origem = { texto: a[0], cidade: a[0], iata: alt, lat: a[1], lon: a[2] };
    }
    dados.origem = origem;
    registrar("resposta", { pergunta: "origem", valor: origem.cidade + (origemDoTelefone ? " (pelo DDD)" : "") });

    // O cálculo, a promoção e, embaixo dela, quanto a pessoa economiza nela.
    const faixa = faixaDe(destino, origem);
    await ele("Perfeito, *" + dados.nome + "*! Agora vou pesquisar a sua passagem entre as *promoções ativas* que o nosso sistema encontrou e calcular *quanto você pode economizar*. Leva só alguns segundinhos ⏳");
    let ativas;
    do { ativas = 19 + Math.floor(Math.random() * 56); } while (ativas % 5 === 0);
    await carregando("Procurando promoções pra você, " + dados.nome, [
      "Conectando ao sistema de promoções da Central de Voos",
      "Saindo de " + origem.cidade + " (" + origem.iata + ") pra " + (destino.cidadeVoo || destino.cidade),
      { texto: "Checando promoções ativas: {n} encontradas", ate: ativas },
      !quando ? "Filtrando as melhores datas dos próximos meses" : quando.asap ? "Filtrando as datas mais próximas, a partir de amanhã" : "Filtrando as datas " + (quando.dia ? "perto de " : /^d[oa]s? /.test(quando.texto) ? "" : "de ") + quando.texto,
      "Comparando com o preço vendido nas companhias aéreas",
      "Calculando a sua economia " + (dados.pessoas === 1 ? "" : "pra " + dados.pessoas + (dados.pessoas === 4 ? " ou mais pessoas" : " pessoas")),
    ], 4000);
    let promo = null;
    try { promo = await mostrarPromo(destino, origem, quando, dados.milhas === "Não tenho nada"); } catch (e) { console.error(e); registrar("erro", { onde: "promo", msg: String(e) }); }
    progresso(0.94);
    if (promo) await cartaoEconomia(promo, destino, faixa);
    await opcoes([{ texto: "Quero receber promoções assim!" }]);
    await ele("É exatamente isso que chega todos os dias pra quem é da *Comunidade VIP*: a promoção com as datas, o valor em dinheiro e em milhas, pra você decidir rápido, antes de acabar ✈️");

    // O fechamento do fluxo.
    await ele("Suas viagens estão prestes a ficar até 87% mais baratas ✈️🎉");
    await eleHtml(
      '<p class="titulo">É na Comunidade Vip Central de Voos que enviamos as melhores oportunidades 👇</p><p class="sub-tabela">Ida e volta, por pessoa (R$)</p><table class="rotas">' +
      tabelaPromocoes(destino, origem, promo, faixa).map((r) => "<tr" + (r.sua ? ' class="sua"' : "") + "><td>" + (r.bandeira ? r.bandeira + " " : "") + esc(r.nome) + '</td><td><span class="de">' + r.cia.toLocaleString("pt-BR") + '</span><span class="por">' + r.vip.toLocaleString("pt-BR") + "</span></td></tr>").join("") +
      "</table>",
      "cartao", 900
    );
    await ele("E como você chegou até aqui, " + dados.nome + ", separei um *presente de Black Friday* pra você 🖤🎁");
    progresso(0.97);
    ajuste = 1000; // da oferta em diante, 1 s a mais de leitura por mensagem
    await presenteBlackFriday();
    await ele("Esse é o seu *presente de Black Friday*: um *CUPOM exclusivo* pra acessar a Comunidade Vip com o maior desconto. APROVEITA!");

    progresso(1);
    registrar("oferta", {});
    const oferta = await cartao(
      '<div class="oferta-topo"><img src="midia/logo-avatar.png" width="54" height="54" alt=""><div><h3>Comunidade VIP</h3><p>Central de Voos</p></div><span class="off">55% OFF</span></div>' +
      '<div class="oferta-corpo">' +
      '<div class="preco-de">De <s>R$ 67,06</s></div>' +
      '<div class="preco-por">R$ 30,18 <small>/ mês</small></div>' +
      '<div class="preco-nota">na assinatura anual</div>' +
      '<div class="cupom"><div><span>🚨 Cupom exclusivo</span><strong>' + esc(CUPOM) + '</strong></div><button type="button" class="copiar">Copiar</button></div>' +
      '<div class="relogio" aria-live="off"><span>⚠️ O cupom é por tempo limitado</span><b class="tempo">15:00</b></div>' +
      '<a class="cta" href="#" target="_blank" rel="noopener">' + txt("botaoOferta", "Entrar para o VIP") + ' <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>' +
      '<div class="aviso">O link do checkout ainda não foi configurado (LINK_CHECKOUT em config.js).</div>' +
      '<div class="garantia"><img class="selo-img" src="midia/selo-garantia-7-dias-p.png" alt="Selo de garantia de 7 dias"><span><b>Garantia de 7 dias.</b> Se não gostar, a gente devolve todo o seu dinheiro.</span></div>' +
      "</div>",
      "cartao oferta", 1000
    );
    relogio15(oferta.querySelector(".tempo"));
    const rodapeEl = document.querySelector(".rodape");
    if (rodapeEl) rodapeEl.hidden = false;
    const copiar = oferta.querySelector(".copiar");
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(CUPOM); copiar.textContent = "Copiado ✓"; } catch (e) { copiar.textContent = CUPOM; }
      registrar("copiou_cupom", {});
    });
    const cta = oferta.querySelector(".cta");
    // Link do checkout: o da versão sorteada (teste do order bump) ou o padrão. O código do link (fim do endereço
    // da Hub.la) vai junto no evento "checkout" pro painel cruzar com as vendas.
    const linkCheckout = txt("linkCheckout", C.LINK_CHECKOUT || "");
    const codigoLink = (linkCheckout.split("?")[0].replace(/\/+$/, "").split("/").pop() || "").slice(0, 60);
    if (linkCheckout) {
      try {
        const url = new URL(linkCheckout, location.href);
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => params.get(k) && url.searchParams.set(k, params.get(k)));
        if (TELEFONE && !params.get("utm_content")) url.searchParams.set("utm_content", TELEFONE);
        cta.href = url.toString();
      } catch (e) { console.error("LINK_CHECKOUT inválido", e); }
    }
    let ultimoToque = 0;
    let clicou = false;
    let fila = Promise.resolve();
    const emFila = (fn) => (fila = fila.then(fn).catch((e) => console.error(e)));
    cta.addEventListener("click", async (e) => {
      if (!linkCheckout) { e.preventDefault(); oferta.querySelector(".aviso").style.display = "block"; }
      else if (Date.now() - ultimoToque < 2500) { e.preventDefault(); return; }
      ultimoToque = Date.now();
      registrar("checkout", { destino: dados.destino && dados.destino.cidade, link: codigoLink });
      if (clicou) return;
      clicou = true;
      await esperar(2500);
      emFila(async () => {
        await ele("🚨Não se esqueça de aplicar seu CUPOM no link acima para receber seu desconto!!!");
        await ele("INSIRA SEU *CUPOM* DESSA FORMA 👇");
        await foto(IMG.comoAplicarCupom, "Clique em *APLICAR CUPOM* e escreva *" + CUPOM + "*.", "Onde aplicar o cupom no checkout");
        await ele("Caso tenha alguma dúvida, me avisa aqui!");
      });
    });
    setTimeout(() => emFila(async () => {
      if (clicou) return;
      await ele("Lembrando que esse desconto é exclusivo e só fica liberado por *poucos minutos*, não esqueça de aplicar o CUPOM!");
      await ele("depois você só consegue comprar o acesso quando abrirmos as vagas novamente e com o valor normal 🙁");
    }), 90000 * ritmo);
    setTimeout(() => emFila(() => duvidas(cta)), 120000 * ritmo);
  }

  // As dúvidas de quem está quase comprando. Cada resposta volta pro botão do VIP.
  const DUVIDAS = [
    ["Preciso ter milhas?", "Não precisa! No VIP você compra as passagens no *Pix ou no cartão*, e elas são emitidas no seu nome, direto no site da companhia aérea. Se tiver milhas, também dá pra usar."],
    ["E se eu não gostar?", "Você tem *7 dias de garantia*. Se não gostar, é só pedir, e a gente devolve todo o seu dinheiro. Sem pergunta e sem complicação."],
    ["Como recebo as promoções?", "No WhatsApp, pelo *grupo da sua região*: são mais de 150 promoções por dia, com os voos saindo perto de você. E na nossa plataforma você ainda procura promoções pelo destino que quiser."],
    ["É seguro?", "Sim! A passagem é emitida no seu nome, no site da própria companhia aérea. Você recebe o *código da reserva* e confere lá mesmo. São mais de 17 mil clientes viajando com a gente."],
    ["Dá pra parcelar?", "Dá sim: *12x de R$ 30,18* no cartão, com o cupom *" + CUPOM + "* aplicado. É o acesso por 1 ano inteiro."],
  ];
  let duvidasAbertas = false;
  async function duvidas(cta) {
    if (duvidasAbertas) return;
    duvidasAbertas = true;
    await ele("Ficou alguma dúvida? 🤔 Toca aqui embaixo que eu te respondo 👇");
    await opcoes([{ texto: "Estou com dúvidas", principal: true }]);
    registrar("abriu_duvidas", {});
    const restantes = [...DUVIDAS];
    const ATENDENTE = "💬 Falar com um atendente";
    let mostrouAtendente = !C.LINK_ATENDENTE;
    await ele("Claro! Qual é a sua dúvida?");
    while (restantes.length || !mostrouAtendente) {
      const escolha = await opcoes([...restantes.map((d) => ({ texto: d[0] })), ...(mostrouAtendente ? [] : [{ texto: ATENDENTE }]), { texto: "Quero entrar no VIP", principal: true }]);
      registrar("duvida", { pergunta: "duvida", valor: escolha.texto.replace(/^💬 /, "") });
      if (escolha.texto === "Quero entrar no VIP") break;
      if (escolha.texto === ATENDENTE) {
        // Link do WhatsApp do atendimento: fica na conversa como botão (abre em outra aba, o funil continua aqui).
        mostrouAtendente = true;
        await ele("Claro! Toca aqui embaixo que você fala direto com o nosso time no WhatsApp 👇");
        const link = document.createElement("a");
        link.className = "opcao principal atendente"; link.href = C.LINK_ATENDENTE; link.target = "_blank"; link.rel = "noopener";
        link.textContent = "💬 Falar com um atendente";
        link.addEventListener("click", () => registrar("atendente", {}));
        const caixa = document.createElement("div");
        caixa.className = "opcoes";
        caixa.appendChild(link);
        conversa.appendChild(caixa); rolar();
        await esperar(1500);
        if (restantes.length) await ele("Se preferir, também te respondo por aqui mesmo 👇", 700);
        else break;
        continue;
      }
      const i = restantes.findIndex((d) => d[0] === escolha.texto);
      await ele(restantes[i][1]);
      restantes.splice(i, 1);
      if (restantes.length || !mostrouAtendente) await ele("Mais alguma dúvida?", 700);
    }
    await ele("Então bora! É só tocar no botão e aplicar o cupom *" + CUPOM + "* 👇");
    const botao = cta.cloneNode(true);
    botao.addEventListener("click", (e) => { e.preventDefault(); cta.click(); });
    const caixa = document.createElement("div");
    caixa.className = "opcoes";
    caixa.appendChild(botao);
    conversa.appendChild(caixa); rolar();
  }

  roteiro();
})();
