Use the imagegen skill with the built-in image_gen tool (not the CLI fallback). Generate exactly 20 images, one separate image_gen call per image, portrait 1024x1536.

After each image is generated, copy that exact generated PNG to:
/home/nanana3679/not4k/.worktrees/classic-skin-versions-pr/assets-lab/classic/revisions/body-imagegen-20260930-r2/generated/<name>.png
Do not create, edit, or delete any other file in the repository. Do not run builds or tests. At the end, print one line per image: <name> -> <copied path>.

Purpose: texture for the body of a long note in a vertical-scrolling rhythm game. The final texture is a 100:20 (5:1) tile that is stacked vertically without seams, so the column must read as one continuous piece when repeated.

Common spec for every image:
- Straight-on orthographic front view of one perfectly vertical bar that fills the entire canvas edge to edge. No background, no perspective, no vignette, no top-to-bottom lighting change, no text, no logos, no noise, no particles.
- Perfectly left-right symmetric.
- If the design has a repeating motif along the length, the motif must repeat exactly every 205 pixels from top to bottom (7.5 repetitions over the 1536-pixel height), with every repetition identical and joining seamlessly. If the design is a pure stripe profile, nothing may change from top to bottom.
- Polished, premium game-UI material (enamel, anodized metal, glass). Crisp shapes, not pixelated. Keep it calm enough that bright note heads drawn on top stay readable: medium overall brightness, no large pure-white areas.

Color palettes (use only these hues; keep large areas richly colored):
- single (blue): darkest #001f4b, low #0272ce, main #077dda, high #0d86e5, highlight #6fd2fe.
- double (gold): darkest #452e02, low #a37807, main #c7990a, high #d8aa0c, highlight #f6e05f.

Designs (all mirror-symmetric):
- bevel: a raised flat center plate with crisp 45-degree bevels falling to both sides, like a machined metal bar. Pure stripe profile.
- fluted: five evenly spaced shallow rounded flutes (grooves) across the width, each with a soft specular edge, like a fluted column. Pure stripe profile.
- trench: flat outer surfaces with a recessed dark channel down the center that holds one thin glowing line. Pure stripe profile.
- capsules: a chain of rounded capsule-shaped enamel segments, one capsule per repetition, separated by thin dark gaps.
- chevron: soft, low-contrast chevron (V) bands engraved into the surface, one chevron per repetition, pointing down.
- hexmesh: a fine honeycomb (hexagon) mesh texture over the surface, subtle relief, repeating cleanly along the length.
- rivets: smooth center face with narrow side rails; each rail carries one small round rivet per repetition.
- rings: a smooth tube with one soft luminous ring band crossing the width per repetition, gently glowing, not white.
- circuit: vertical tech traces with small nodes and short branches, circuit-board style, repeating every repetition.
- facets: a faceted crystal surface made of diamond-shaped facets with sharp edges, one row of facets per repetition.

Generate these 20 names, each combining one design with one palette:
bevel-single, bevel-double, fluted-single, fluted-double, trench-single, trench-double, capsules-single, capsules-double, chevron-single, chevron-double, hexmesh-single, hexmesh-double, rivets-single, rivets-double, rings-single, rings-double, circuit-single, circuit-double, facets-single, facets-double
