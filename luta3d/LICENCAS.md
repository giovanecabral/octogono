# Licenças da luta em 3D

| O quê | De onde | Licença |
|---|---|---|
| `vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`, `RoomEnvironment.js` | three.js r169 (https://threejs.org) | MIT, aviso no cabeçalho de cada arquivo. Os imports foram trocados pra caminho relativo. |
| `lutador.glb`, `hair_buzzed.glb`, `hair_beard.glb`, `hair_simpleparted.glb` | Quaternius, Universal Base Characters (https://quaternius.com) | CC0 1.0 |
| `mx_lutas.glb` (animações) | Mixamo (Adobe), convertidas pro esqueleto do corpo acima | Termos do Mixamo: uso livre em jogo, sem redistribuir o arquivo. Por isso ele NÃO vai pro repositório (`.gitignore`); só sobe no deploy. |

O adversário é sempre um corpo genérico: nenhum lutador real tem rosto ou
corpo próprio no jogo (direito de imagem).
