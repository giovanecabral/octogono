# Licenças da luta em 3D

| O quê | De onde | Licença |
|---|---|---|
| `vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`, `RoomEnvironment.js` | three.js r169 (https://threejs.org) | MIT, aviso no cabeçalho de cada arquivo. Os imports foram trocados pra caminho relativo. |
| `vendor/EffectComposer.js`, `RenderPass.js`, `ShaderPass.js`, `MaskPass.js`, `Pass.js`, `CopyShader.js`, `RGBELoader.js` | three.js r169, examples/jsm (https://unpkg.com/three@0.169.0/examples/jsm/), 2026-11-26 | MIT. Os imports foram trocados pra caminho relativo. |
| `../assets/hdri/arena.hdr` | Poly Haven, "Crossfit Gym" de Dimitrios Savva, 2K .hdr (https://polyhaven.com/a/crossfit_gym, baixado pela API em 2026-11-26) | CC0 1.0 |
| `lutador.glb` (malha e relevo do corpo) | Blender Studio, Human Base Meshes v1.2, "Realistic Male Body" (https://www.blender.org/download/demo-files/) | CC0 1.0 |
| `lutador.glb` (pele, pesos de osso, sobrancelhas) | MakeHuman / MPFB2 (https://static.makehumancommunity.org): pele young_caucasian_male e sobrancelhas mindfront_eyebrows_04, pacotes CC0 | CC0 1.0 |
| esqueleto do `lutador.glb` (nomes e orientações dos ossos) | Quaternius, Universal Base Characters (https://quaternius.com); o corpo antigo fica em `ferramentas/corpo3d/esqueleto_referencia.glb` | CC0 1.0 |
| `pecas/*.glb`, `fios.webp`, `cachos.webp` | gerados por `ferramentas/corpo3d` (cabelo, barba, calção, luva e roupas de entrada modelados por script em cima do corpo acima) | CC0 1.0 |
| `mx_lutas.glb` (animações) | Mixamo (Adobe): o pacote de 2026-11-08 e o de boxe de 2026-11-10 (guarda gingando, golpes, esquivas, reações, entrada, vitória e derrota), convertidas pro esqueleto do corpo acima | Termos do Mixamo: uso livre em jogo, sem redistribuir o arquivo. Por isso ele NÃO vai pro repositório (`.gitignore`); só sobe no deploy. |

Orelha couve-flor, cicatrizes, tatuagens e a pintura do cabelo curto e da barba
são feitas por código em `aparencia.js`: nada novo de fora.

Na carreira o adversário é sempre um corpo genérico: nenhum lutador real tem
rosto ou corpo próprio no jogo (direito de imagem). No Online os dois são
personagens criados pelos jogadores.
