Blender sources for the COC 2 crimping close-up background (Blender 4.2+ / 5.x, Cycles).

Put next to these scripts: oak_wood_planks_4k/ (unzipped), brown_photostudio_07_4k.exr, Y_Bot.fbx.
  blender -b -P scene.py -- final     -> out/bench_bg.png, out/camera.json, out/env.hdr (save a 1024x512 JPEG of the HDRI as assets/crimp/env.jpg), scene.blend
  blender -b -P hands.py              -> out/hand_r.glb, out/hand_l.glb (forearm + hand cut from Y Bot, finger bones kept)
Then save bench_bg.png as assets/crimp/bench_bg.jpg and copy camera.json into assets/crimp/.
camera.json is what lines the Three.js camera up with the render; re-copy it whenever you move the Blender camera.
