"""B-roll for the install ads (content/copy/ad-fr.md, content/copy/ad-bg.md).

    python scripts/content/broll.py <paris|sofia> stills   # Z-Image Turbo
    python scripts/content/broll.py <paris|sofia> motion   # WAN 2.2 TI2V 5B

`stills` queues each shot's batch. Pick by eye, copy the pick to the start-image
path the shot names (content/gen/, local only), then run `motion`. Clips land in
ComfyUI's output folder; the ones the ads are cut from are committed at
content/ads/broll/, which is what scripts/content/ad.mts reads.

**SHOTS is the record, not a template.** Every prompt and seed below is the one
that produced a committed clip, verbatim — including the avoid-lists that lesson
1 says never to write, because that is what actually ran. The prompts evolved
between passes, so a pick is only reproducible from its own entry; a new shot
should follow the lessons instead of copying these.

Five things that each cost a reroll, all of which generalise:

 1. **Z-Image Turbo has no negative channel.** It is DMD-distilled with CFG
    baked in, so every token is positive conditioning, and an "Avoid: folk
    costume, headscarf, user interface" list SUMMONS all three — the first Sofia
    café passes put a woman in full national dress into the background, and the
    Paris pass got a face and a camera UI from its own avoid-list. Describe
    absence as presence (an empty room, bare chairs pushed in). WAN runs at cfg
    5.0 and its negative does work, so the avoid-list belongs in motion only.
 2. **Naming the city in an interior pulls heritage imagery.** The Sofia café is
    a generic modern coffee bar; the street shot is what says which city.
 3. **"A phone" means an iPhone.** From the back it draws the square
    triple-lens island, from the front a notch. These are Google Play install
    ads (ADS.md §2): name a current Android model and describe its front — flat,
    even bezels, one centred punch-hole.
 4. **Point of view means the screen faces the viewer**, switched off and
    matte, so nothing gets drawn on it. A fabricated UI in an ad for a real one
    cannot ship.
 5. **No finger acting in motion.** "Her thumb moves up toward the screen" grew
    a second thumb while the first kept gripping. The hand moves as one, and
    the person has to read as the same person across both shots — same coat,
    same hand — or the cut reads as two people.
"""
import json, sys, urllib.request, uuid

HOST = "http://127.0.0.1:8188"

_SOFIA_AVOID = (
    "Avoid: face, head, shoulders, profile, portrait, eyes, folk costume, traditional "
    "embroidery, national dress, ethnic pattern, headscarf, peasant clothing, rustic "
    "styling, any screen content, any user interface, app icons, text, writing, signage, "
    "logos, watermarks, over-smooth plastic skin, CGI render look, waxy texture, "
    "distorted fingers, extra fingers, unrealistic symmetry, flat lighting."
)

SHOTS = {
    "paris": [
        {
            "clip": "content/ads/broll/fr-cafe.webm",
            "still": "content/gen/adfr_02_cafe_hold.png",
            "pick": "second image of the batch",
            "seed": 7314, "batch": 2,
            "prompt": (
                "A candid smartphone photograph looking down at a small round marble bistro table in a Paris "
                "cafe just after lunch. On the table: a white plate with a few crumbs and a smear of sauce left "
                "on it, a used fork resting across the rim, a half-finished glass of red wine, a small espresso "
                "cup on a saucer, a crumpled paper napkin. A woman's hand and forearm enter from the lower right, "
                "reaching for a smartphone that lies face-down on the table next to the plate. Her face is not in "
                "the frame at all. Warm natural afternoon daylight coming from a window on the left, soft "
                "directional shadows across the marble, shallow depth of field with blurred bistro chairs and a "
                "street beyond. Realistic skin texture on the hand, fine natural detail, slightly imperfect "
                "handheld framing, documentary UGC advertising aesthetic, shot on a modern phone camera. Vertical "
                "9:16 composition. Avoid: any face, any visible phone screen content, text, writing, logos, "
                "watermarks, over-smooth plastic skin, CGI render look, waxy texture, distorted fingers, extra "
                "fingers, unrealistic symmetry, flat lighting."
            ),
            "motion_seed": 2211,
            "motion": (
                "A still handheld shot of a Paris cafe table after lunch. The woman's hand moves slowly and "
                "naturally to pick up the smartphone lying on the marble table. Only her hand and forearm move. "
                "The plate, the wine glass and the espresso cup stay completely still. Warm daylight, soft "
                "shadows, very slight handheld camera drift. Her face never enters the frame. The phone screen "
                "stays dark and blank. One continuous shot."
            ),
            "negative": (
                "static still picture, frozen, no motion, morphing, warping, distorted anatomy, extra fingers, "
                "melting hands, face appearing, person turning towards camera, camera cut, scene change, text, "
                "subtitles, watermark, logo, user interface, phone screen turning on, oversaturated, low quality, "
                "jpeg artifacts"
            ),
        },
        {
            "clip": "content/ads/broll/fr-street.webm",
            "still": "content/gen/adfr_04_street_away.png",
            "pick": "first image of the batch",
            "seed": 4471, "batch": 2,
            "prompt": (
                "A candid smartphone photograph of a woman walking away along a sunny Paris pavement, "
                "photographed from behind at hip height. The frame is cropped at her waist: only her lower "
                "back, her jacket hem, her hand and her legs are visible, and everything above the waist is "
                "outside the picture. No head, no shoulders, no face anywhere in the image. Her hand is "
                "sliding a dark smartphone down into the side pocket of her coat, so the screen is hidden "
                "against the fabric and nothing on the screen can be seen. Cobblestones and a Haussmann stone "
                "facade softly out of focus ahead of her, a cafe awning, long warm late-afternoon shadows "
                "across the pavement. Slight motion blur from walking, handheld camera feel, realistic fabric "
                "and skin texture, documentary UGC advertising aesthetic, shot on a modern phone camera. "
                "Vertical 9:16 composition. Avoid: face, head, shoulders, profile, portrait, eyes, any screen "
                "content, any user interface, camera app, icons, text, writing, signage, logos, watermarks, "
                "over-smooth plastic skin, CGI render look, distorted fingers, extra fingers."
            ),
            "motion_seed": 8812,
            "motion": (
                "A handheld shot following a woman from behind as she walks away along a sunny Paris pavement. "
                "She walks steadily away from the camera, her arm swinging gently at her side with the dark "
                "smartphone held loosely in her hand, its screen switched off and facing away from the camera. "
                "The blurred stone facade and cobblestones drift slowly past. Warm golden late afternoon light, "
                "long shadows. She never turns around and her face never enters the frame. One continuous shot."
            ),
            "negative": (
                "phone screen turning on, glowing screen, bright screen, app icons, user interface, wallpaper, "
                "text, subtitles, watermark, logo, face appearing, person turning around, looking back, "
                "morphing, warping, distorted anatomy, extra fingers, melting hands, camera cut, scene change, "
                "static frozen image, low quality"
            ),
        },
    ],
    "sofia": [
        {
            "clip": "content/ads/broll/bg-cafe.webm",
            "still": "content/gen/adbg_01_cafe.png",
            "pick": "first image of the batch",
            "seed": 3131, "batch": 4,
            "prompt": (
                "A candid point-of-view smartphone photograph looking down at a small round walnut cafe table "
                "after lunch. On the table: a white ceramic plate holding a few crumbs and a smear of orange "
                "sauce, a fork resting across the rim, a tall glass of sparkling water with a slice of lemon, a "
                "small white espresso cup on a saucer, a folded cream linen napkin and a slim black pen. The "
                "diner, a young woman, holds a Samsung Galaxy S24 Android smartphone upright in her right hand, "
                "its screen facing the viewer: a flat edge-to-edge display that is switched off and uniformly "
                "matte black, framed by a perfectly even thin black bezel on all four sides, the only mark on it "
                "a single tiny circular punch-hole selfie camera centred just below the top edge. Her hand is "
                "slender and feminine, with long fine fingers, neat short nails in a natural nude polish and a "
                "thin gold ring; her fingers curl around the back of the phone and her thumb rests along its "
                "lower right edge. Her wrist disappears into the cuff of a tailored camel wool coat over a "
                "cream knit. The room beyond is a quiet empty modern coffee bar at the end of lunch service: "
                "bare pale oak chairs pushed in at clean vacant tables, a polished concrete floor, a tall window "
                "to the left letting in soft even grey daylight. Shallow depth of field, realistic skin texture, "
                "fine fabric weave, documentary editorial photograph, shot on a modern phone camera. Vertical "
                "9:16 composition."
            ),
            "motion_seed": 5353,
            "motion": (
                "A calm point-of-view handheld shot at a cafe table after lunch. The woman lifts the dark "
                "Android phone slowly a little closer toward the viewer and tilts it very slightly, her whole "
                "hand moving as one with her grip unchanged. The plate, the glass of water and the cup stay "
                "completely still. Soft even daylight, gentle natural handheld drift. One continuous shot."
            ),
            "negative": (
                "phone screen turning on, glowing screen, lit display, app icons, user interface, text, notch, "
                "iphone, apple logo, phone turning around, back of the phone, camera lenses, people in the "
                "background, folk costume, traditional embroidery, headscarf, face, person turning around, "
                "morphing, warping, distorted anatomy, extra fingers, second thumb, extra thumb, six fingers, "
                "finger growing, fingers moving, man's hand, male hand, thick fingers, hairy knuckles, "
                "camera cut, static frozen image, low quality"
            ),
        },
        {
            "clip": "content/ads/broll/bg-street.webm",
            "still": "content/gen/adbg_02_street.png",
            "pick": "second image of the batch",
            "seed": 6640, "batch": 2,
            "prompt": (
                "A candid smartphone photograph following a woman in modern business dress walking along a "
                "sunny central Sofia pavement in the early afternoon, photographed from just behind her and "
                "low down at the level of her hand. The frame is cropped at her elbow: only her forearm, her "
                "hand, the sleeve of a tailored camel wool coat and the street beyond are visible. No head, "
                "no shoulders, no face anywhere in the image. She holds a dark smartphone loosely at her "
                "side, screen turned inward and hidden from the camera. Behind her, softly out of focus, the "
                "distinctive yellow cobblestone paving of central Sofia, early-twentieth-century stone "
                "facades with wrought iron balconies, a glass office frontage and other professionals in "
                "business coats. Warm golden afternoon light, long shadows, slight motion blur from walking, "
                "handheld camera feel. Realistic skin and fabric texture, documentary UGC advertising "
                "aesthetic, shot on a modern phone camera. Vertical 9:16. " + _SOFIA_AVOID
            ),
            "motion_seed": 2288,
            "motion": (
                "A handheld shot following a woman in a camel wool coat walking along a sunny cobblestone "
                "street. Her arm swings gently with her stride and the dark phone stays held at her side. The "
                "blurred stone facades and pedestrians drift slowly past behind her. Warm golden afternoon "
                "light. One continuous shot."
            ),
            "negative": (
                "phone screen turning on, glowing screen, app icons, user interface, text, watermark, "
                "folk costume, traditional embroidery, headscarf, face appearing, person turning around, "
                "morphing, warping, distorted anatomy, extra fingers, camera cut, static frozen image, low quality"
            ),
        },
    ],
}


def still_graph(prompt, seed, prefix, batch):
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "qwen_image"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "z-image-ae.safetensors"}},
        "4": {"class_type": "TextEncodeZImageOmni",
              "inputs": {"clip": ["2", 0], "prompt": prompt, "auto_resize_images": True}},
        "5": {"class_type": "TextEncodeZImageOmni",
              "inputs": {"clip": ["2", 0], "prompt": "", "auto_resize_images": True}},
        "6": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 768, "height": 1344, "batch_size": batch}},
        "7": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0],
                         "latent_image": ["6", 0], "seed": seed, "steps": 10, "cfg": 1,
                         "sampler_name": "dpmpp_sde", "scheduler": "beta", "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }


def motion_graph(image, motion, negative, seed, prefix):
    return {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image, "upload": "image"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": motion}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": negative}},
        "7": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "8": {"class_type": "Wan22ImageToVideoLatent",
              "inputs": {"vae": ["3", 0], "width": 704, "height": 1280, "length": 49,
                         "batch_size": 1, "start_image": ["4", 0]}},
        "9": {"class_type": "KSampler",
              "inputs": {"model": ["7", 0], "positive": ["5", 0], "negative": ["6", 0],
                         "latent_image": ["8", 0], "seed": seed, "steps": 20, "cfg": 5.0,
                         "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}},
        "11": {"class_type": "SaveWEBM",
               "inputs": {"images": ["10", 0], "filename_prefix": prefix,
                          "codec": "vp9", "fps": 24.0, "crf": 24.0}},
    }


def upload(path):
    name = path.replace("\\", "/").split("/")[-1]
    b = "----dsf" + uuid.uuid4().hex
    data = open(path, "rb").read()
    body = (f"--{b}\r\n".encode()
            + f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n'.encode()
            + b"Content-Type: image/png\r\n\r\n" + data + b"\r\n"
            + f"--{b}\r\n".encode()
            + b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n'
            + f"--{b}--\r\n".encode())
    req = urllib.request.Request(HOST + "/upload/image", data=body,
                                 headers={"Content-Type": "multipart/form-data; boundary=" + b})
    return json.load(urllib.request.urlopen(req, timeout=60)).get("name", name)


def queue(graph):
    req = urllib.request.Request(HOST + "/prompt",
                                 data=json.dumps({"prompt": graph, "client_id": str(uuid.uuid4())}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60)).get("prompt_id")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in SHOTS or sys.argv[2] not in ("stills", "motion"):
        sys.exit(f"usage: broll.py <{'|'.join(SHOTS)}> <stills|motion>")
    city, mode = sys.argv[1], sys.argv[2]
    for shot in SHOTS[city]:
        prefix = shot["clip"].split("/")[-1].rsplit(".", 1)[0]
        if mode == "stills":
            pid = queue(still_graph(shot["prompt"], shot["seed"], prefix, shot["batch"]))
            print(f"{prefix:10} stills {pid}  (committed pick: {shot['pick']})")
        else:
            image = upload(shot["still"])
            pid = queue(motion_graph(image, shot["motion"], shot["negative"], shot["motion_seed"], prefix))
            print(f"{prefix:10} motion {pid}")
