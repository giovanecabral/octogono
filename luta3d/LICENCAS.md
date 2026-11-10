# Licenças da luta em 3D

| O quê | De onde | Licença |
|---|---|---|
| `vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`, `RoomEnvironment.js` | three.js r169 (https://threejs.org) | MIT, aviso no cabeçalho de cada arquivo. Os imports foram trocados pra caminho relativo. |
| `lutador.glb`, `hair_buzzed.glb`, `hair_beard.glb`, `hair_simpleparted.glb` | Quaternius, Universal Base Characters (https://quaternius.com) | CC0 1.0 |
| `mx_lutas.glb` (animações) | Mixamo (Adobe): o pacote de 2026-11-08 e o de boxe de 2026-11-10 (guarda gingando, golpes, esquivas, reações, entrada, vitória e derrota), convertidas pro esqueleto do corpo acima | Termos do Mixamo: uso livre em jogo, sem redistribuir o arquivo. Por isso ele NÃO vai pro repositório (`.gitignore`); só sobe no deploy. |

Cabelos além dos três do Quaternius (moicano, trança nagô, dreads, coque,
black power, cacheado, descolorido), barbas recortadas, orelha couve-flor,
roupas de entrada, cicatrizes e tatuagens são feitos por código em
`aparencia.js`, a partir dessas peças: nada novo de fora.

Na carreira o adversário é sempre um corpo genérico: nenhum lutador real tem
rosto ou corpo próprio no jogo (direito de imagem). No Online os dois são
personagens criados pelos jogadores.
