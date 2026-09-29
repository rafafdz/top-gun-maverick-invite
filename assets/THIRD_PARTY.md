# Third-party assets

## 3D model — `assets/models/jet.glb`

| | |
|---|---|
| Title | **Jet** |
| Author | **jeremy** (Jeremy Edelblut — https://jeremy.toys) |
| Source | Poly Pizza — https://poly.pizza/m/6fyLMORhgGK (originally published on Google Poly, 2017-10-22) |
| Original file | https://static.poly.pizza/19d58465-dafb-4df0-a3b8-b0500bd9ed4b.glb |
| License | **Creative Commons Attribution 3.0 (CC BY 3.0)** — https://creativecommons.org/licenses/by/3.0/ |
| SHA-256 | `4196c1920cec466a5211f8d9a86b3eb08ec1772e7e96e73cda7fede525f6e950` |
| Geometry | 1 mesh, 4 materials, ~1,434 triangles, no textures |

**Changes:** the `.glb` file is included unmodified. At runtime (`scene.js`) its four
materials are replaced with a recoloured palette (off-white, warm grey, graphite, and
an electric-blue canopy), with flat shading, and the model is re-centred and scaled.

Attribution shown on the site footer: “Modelo 3D ‘Jet’ de jeremy, CC BY 3.0 (colores modificados)”.

## Three.js — `vendor/three/`

- `three.module.min.js` r170 (`three@0.170.0`), `addons/loaders/GLTFLoader.js`, `addons/utils/BufferGeometryUtils.js`
- Source: https://github.com/mrdoob/three.js — **MIT License**, © 2010–2024 three.js authors (see `vendor/three/LICENSE`).
- Vendored so the site has no CDN dependency on GitHub Pages.

## Fonts

Geist and Geist Mono via Google Fonts — SIL Open Font License 1.1.
