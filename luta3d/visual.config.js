/* Valores visuais da luta em 3D (2026-11-26): luz, pós-processamento, câmera e sensação de impacto.
   Tudo que é ajuste de olho mora aqui; o código só lê. Mudou um número: recarregue a página (sem build).
   Cores em "#rrggbb". Intensidade de luz em candela (spot) ou lux (direcional e céu), como no three.js.
   Mexeu em qualquer valor de custo (bloom, resolução, sombra): meça com
   node ferramentas/visual3d.mjs custo   (tempo de quadro de cada modo, sem o limite de 60 quadros). */
export default {
  /* ---------- qualidade ----------
     O jogador escolhe no botão do canto da luta (Automática, Baixa, Média, Alta); fica lembrado em "luta3d:qualidade".
     Automática começa em "alta" no computador e "media" no celular e desce sozinha abaixo de 45 quadros por segundo. */
  qualidade: {
    // resolucao = densidade de pixel máxima; celular = a do celular (tela com menos de 700 de largura; antes era 1,25 sem pós). Medido (2026-11-26, Apple M5, 1280 x 720
    // com retina): o pós-processamento custa ~1,3 ms de placa na resolução 1,5; com 1,35 a alta fica dentro dos 10% do
    // quadro de antes (ferramentas/visual3d.mjs custo)
    baixa: { resolucao: 1, celular: 1, sombra: 1024, pos: false, hdri: false },                  // celular fraco: sem pós-processamento
    media: { resolucao: 1.25, celular: 1.05, sombra: 2048, pos: true, bloom: true, hdri: true, grao: false, aberracao: false },
    alta:  { resolucao: 1.35, celular: 1.1, sombra: 2048, pos: true, bloom: true, hdri: true, grao: true, aberracao: true },
  },

  /* ---------- exposição e ambiente ---------- */
  exposicao: 0.95,              // ACES; mais alto clareia tudo
  ambiente: {
    hdri: "../assets/hdri/arena.hdr",   // crossfit_gym do Poly Haven (CC0); sem ele, ambiente procedural
    intensidade: 0.16,          // o HDRI só reflete e preenche: a luz principal é o canhão de cima (mais que isso a sombra fica lilás: o ginásio tem luz fria e chão azul)
    intensidadeReserva: 0.3,    // a do ambiente procedural (modo baixo, ou HDRI que não carregou)
    rotacao: 0.6,               // giro do HDRI em radianos (onde caem as janelas de luz no reflexo)
    fundo: "#040508",           // cor do fundo da arena
    neblina: { cor: "#05060a", perto: 8, longe: 30 },   // a plateia afunda no escuro: o olho vai pro octógono
  },

  /* ---------- luzes ---------- */
  luzes: {
    ceu: { cor: "#6f7a9c", chao: "#120d0b", intensidade: 0.42 },
    principal: { cor: "#fff6ea", intensidade: 270, abertura: 0.75, penumbra: 0.6, altura: 9.2 },   // abertura em radianos
    // contraluz atrás dos lutadores, do lado oposto da câmera: vermelha à esquerda da tela, azul à direita
    // alto e mirando no tronco: mais baixo a luz lavava a lona de lilás
    contraluz: { vermelha: { cor: "#ff3a2e", intensidade: 90 }, azul: { cor: "#4a7dff", intensidade: 96 }, distancia: 5, lado: 4.2, altura: 6, alvo: 1.35, abertura: 0.32 },
    preenchimento: { cor: "#fff1e6", intensidade: 0.6 },   // acompanha a câmera: o rosto não some na sombra
    contatoPes: { opacidade: 0.55, tamanho: 0.34 },        // sombra macia embaixo de cada pé (some quando o pé sobe)
  },

  /* ---------- pele (só material, sem mexer em textura nem malha) ---------- */
  pele: {
    especular: 0.55,            // 1 = brilho de plástico; menos tira o reflexo duro da pele
    verniz: 0.06, vernizAspereza: 0.6,        // o suor em cima da pele
    bordaForca: 0.35, bordaCor: "#c87a62", bordaAspereza: 0.55,   // brilho de borda quente (a luz de contorno atravessando a pele)
    reflexo: 0.32,              // quanto do ambiente reflete na pele
  },

  /* ---------- pós-processamento (modos média e alta) ---------- */
  pos: {
    bloom: { forca: 0.6, raio: 1.5, limiar: 1.6 },   // limiar acima da pele mais clara: só luzes e telões brilham; raio = largura do borrão
    brilhoLuzes: 3,             // lentes dos refletores e luzinhas da arquibancada mais fortes que a pele (só com pós-processamento)
    brilhoTelas: 1.5,           // telões, telas das mesas e faixa de LED (mais que isso o texto do telão desbota)
    contraste: 1.06, saturacao: 1.03,
    cantos: 0.18,               // saturação a mais só no vermelho e no azul dos cantos
    vinheta: { forca: 0.32, raio: 0.78, suavidade: 0.45 },
    grao: 0.025,                // grão de filme (só no alta)
    aberracao: { forca: 0.006, duracao: 0.18, limiar: 1.4 },   // pico de aberração cromática no golpe forte (só no alta)
  },

  /* ---------- câmera ---------- */
  camera: {
    tv: { distancia: 4.4, altura: 1.95, fov: 40, fovPorMetro: 3.5, fovMin: 37, fovMax: 46 },   // plano médio; o campo abre quando eles se afastam
    perto: { distancia: 3.2, altura: 1.6, fov: 38 },
    nocaute: { distancia: 2.8, fov: 36 },
    cerimonia: { distancia: 4.4, altura: 1.4, olhar: 1.0, fovInicio: 40, fovSuspense: 35, fovAnuncio: 39 },   // os três de corpo inteiro
    tremor: { base: 0.008, porForca: 0.012, recuperacao: 9 },   // tremor = base + porForca × força² (jab ~0,014; nocaute ~0,066)
    socoZoom: { porForca: 2.5, limiar: 1.25 },                   // o campo fecha por um instante nos golpes fortes
  },

  /* ---------- sensação de impacto ---------- */
  impacto: {
    hitstop: { min: 0.04, max: 0.07, forcaMax: 2.2, lento: 0.04 },   // segundos parados no contato (força 0 = min, forcaMax = max); lento = velocidade do mundo parado
    lenta: { escala: 0.3, duracao: 0.6, volta: 0.5 },               // câmera lenta do nocaute: velocidade, quanto dura, quanto leva pra voltar
    flash: { limiar: 1.25 },                                       // vinheta vermelha a partir desta força
    particulas: { base: 6, porForca: 8, maximo: 48 },             // gotas por golpe = base + porForca × força; nunca mais que o máximo na tela
  },
};
