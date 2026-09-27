#!/usr/bin/env python3
"""Pocketcraft · Texturen nach Minecraft-Art

Schreibt games/pocketcraft/vorlage.js: Bilder aus „Pixel Perfection“ von
XSSheep (CC BY-SA 4.0), so wie sie in VoxeLibre liegen. Manche werden nur
übernommen, manche eingefärbt (Gras, Laub, Wasser, Redstone, Lederrüstung —
die liegen dort grau und werden erst im Spiel gefärbt), manche aus einem
Modell-Bild zugeschnitten (Truhe, Bett) oder zusammengesetzt (Grasseite).
Alles hier Abgeleitete steht ebenfalls unter CC BY-SA 4.0.

Aufruf:  python3 werkzeug/pp-texturen.py [Pfad zu VoxeLibre]
Die Dateien kommen aus dessen Ordner textures/ (bei einem Klon ohne
Inhalte vorher: git checkout HEAD -- textures/<name>.png).

Im Spiel ersetzt jedes Bild hier die gleichnamige gemalte Textur aus
texturen.js; was hier fehlt (die Spielerfigur), bleibt gemalt.
"""
import base64, os, sys
from PIL import Image

VL = sys.argv[1] if len(sys.argv) > 1 else '/home/user/voxelibre/voxelibre'
TEX = os.path.join(VL, 'textures')
ZIEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'pocketcraft', 'vorlage.js')

# Farben des Vorbilds in der Ebene (Gras und Laub der Wiese, Wasser)
GRAS = (145, 189, 89)
LAUB = (119, 171, 47)
FICHTE = (97, 153, 97)
WASSER = (63, 118, 228)
LEDER = (160, 101, 64)


def lade(name):
    pfad = os.path.join(TEX, name + '.png')
    if not os.path.exists(pfad):
        sys.exit('fehlt: ' + pfad + ' — vorher: git checkout HEAD -- textures/' + name + '.png')
    return Image.open(pfad).convert('RGBA')


def faerben(im, farbe):
    """grau mal Farbe, wie das Vorbild seine Gras- und Laubbilder färbt"""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r * farbe[0] // 255, g * farbe[1] // 255, b * farbe[2] // 255, a)
    return im


def ausschnitt(im, x, y, w, h):
    return im.crop((x, y, x + w, y + h))


def rand_auf(im, w, h):
    """kleineres Bild mittig auf w×h, der Rand wiederholt die äußeren Pixel"""
    neu = Image.new('RGBA', (w, h))
    ox, oy = (w - im.width) // 2, (h - im.height) // 2
    q = im.load()
    for y in range(h):
        for x in range(w):
            sx = min(max(x - ox, 0), im.width - 1)
            sy = min(max(y - oy, 0), im.height - 1)
            neu.putpixel((x, y), q[sx, sy])
    return neu


def ueber(unten, oben):
    b = unten.copy()
    b.alpha_composite(oben)
    return b


def bilder():
    B = {}
    einfach = {
        'stone': 'default_stone', 'cobble': 'default_cobble', 'dirt': 'default_dirt',
        'grass_side_snow': 'mcl_core_grass_side_snowed', 'sand': 'default_sand', 'gravel': 'default_gravel',
        'bedrock': 'mcl_core_bedrock', 'sandstone': 'mcl_core_sandstone_normal', 'sandstone_top': 'mcl_core_sandstone_top',
        'snow': 'default_snow', 'stonebrick': 'default_stone_brick', 'log_side': 'default_tree', 'log_top': 'default_tree_top',
        'planks': 'default_wood', 'fichte_side': 'mcl_core_log_spruce', 'fichte_top': 'mcl_core_log_spruce_top',
        'glass': 'default_glass', 'cactus_side': 'mcl_core_cactus_side', 'cactus_top': 'mcl_core_cactus_top',
        'coal_ore': 'mcl_core_coal_ore', 'iron_ore': 'mcl_core_iron_ore', 'gold_ore': 'mcl_core_gold_ore',
        'diamond_ore': 'mcl_core_diamond_ore', 'rs_erz': 'mcl_core_redstone_ore',
        'iron_block': 'default_steel_block', 'gold_block': 'default_gold_block', 'diamond_block': 'default_diamond_block',
        'wool0': 'wool_white', 'wool1': 'wool_grey', 'wool2': 'wool_black', 'wool3': 'wool_brown',
        'craft_top': 'crafting_workbench_top', 'craft_side': 'crafting_workbench_side',
        'furn_side': 'default_furnace_side', 'furn_top': 'default_furnace_top',
        'furn_front': 'default_furnace_front', 'furn_lit': 'default_furnace_front_active',
        'jukebox_side': 'mcl_jukebox_side', 'jukebox_top': 'mcl_jukebox_top',
        'rs_block': 'redstone_redstone_block', 'rs_verstaerker': 'mesecons_delayer_off', 'rs_verstaerker_an': 'mesecons_delayer_on',
        'kolben_oben': 'mesecons_piston_pusher_front', 'kolben_oben_klebrig': 'mesecons_piston_pusher_front_sticky',
        'kolben_seite': 'mesecons_piston_bottom', 'kolben_unten': 'mesecons_piston_back', 'kolben_innen': 'mesecons_piston_on_front',
        'rs_lampe': 'jeija_lightstone_gray_off', 'rs_lampe_an': 'jeija_lightstone_gray_on',
        'farmland': 'mcl_farming_farmland_dry', 'ladder': 'default_ladder',
        'door_top': 'mcl_doors_door_wood_upper', 'door_bottom': 'mcl_doors_door_wood_lower',
        'torch': 'default_torch_on_floor', 'rs_fackel': 'jeija_torches_on', 'rs_fackel_aus': 'jeija_torches_off',
        'hebel': 'jeija_wall_lever',
        'rose': 'mcl_flowers_poppy', 'dandelion': 'flowers_dandelion_yellow',
        # Gegenstände
        'i_stick': 'default_stick', 'i_coal': 'default_coal_lump', 'i_iron': 'default_steel_ingot',
        'i_gold': 'default_gold_ingot', 'i_diamond': 'default_diamond',
        'i_pork_raw': 'mcl_mobitems_porkchop_raw', 'i_pork_cook': 'mcl_mobitems_porkchop_cooked',
        'i_apple': 'default_apple', 'i_golden_apple': 'mcl_core_apple_golden',
        'i_seeds': 'mcl_farming_wheat_seeds', 'i_wheat': 'farming_wheat_harvested', 'i_bread': 'farming_bread',
        'i_bucket': 'mcl_buckets_bucket', 'i_water_bucket': 'mcl_buckets_water_bucket',
        'i_door': 'doors_item_wood', 'i_bed': 'mcl_beds_bed_red_inv', 'i_leather': 'mcl_mobitems_leather',
        'i_beef_raw': 'mcl_mobitems_beef_raw', 'i_beef_cooked': 'mcl_mobitems_beef_cooked',
        'i_mutton_raw': 'mcl_mobitems_mutton_raw', 'i_mutton_cooked': 'mcl_mobitems_mutton_cooked',
        'i_chicken_raw': 'mcl_mobitems_chicken_raw', 'i_chicken_cooked': 'mcl_mobitems_chicken_cooked',
        'i_bone': 'mcl_mobitems_bone', 'i_bone_meal': 'mcl_bone_meal', 'i_arrow': 'mcl_bows_arrow_inv',
        'i_bow': 'mcl_bows_bow', 'i_string': 'mcl_mobitems_string', 'i_shears': 'default_tool_shears',
        'i_flint': 'default_flint', 'i_milk_bucket': 'mcl_mobitems_bucket_milk', 'i_feather': 'mcl_mobitems_feather',
        'i_egg': 'mcl_throwing_egg', 'i_redstone': 'redstone_redstone_dust', 'i_schleimball': 'mcl_mobitems_slimeball',
        'i_hebel': 'jeija_wall_lever', 'i_verstaerker': 'mesecons_delayer_item', 'i_platte': 'mcl_jukebox_record_cat',
    }
    for ziel, quelle in einfach.items():
        B[ziel] = lade(quelle)
    # der Plattenspieler mit Platte: dasselbe Bild, im Schlitz schaut die Platte heraus
    voll = lade('mcl_jukebox_top')
    for x in range(6, 10):
        voll.putpixel((x, 7), (40, 40, 44, 255)); voll.putpixel((x, 8), (30, 90, 40, 255))
    B['jukebox_top_voll'] = voll

    # Werkzeuge, Rüstung
    for ms, mq in [('wood', 'wood'), ('stone', 'stone'), ('iron', 'steel'), ('gold', 'gold'), ('diamond', 'diamond')]:
        for ks, kq in [('pickaxe', 'pick'), ('axe', 'axe'), ('shovel', 'shovel'), ('sword', 'sword')]:
            B['i_%s_%s' % (ms, ks)] = lade('default_tool_%s%s' % (mq, kq))
        B['i_%s_hoe' % ms] = lade('farming_tool_%shoe' % mq)
    for m in ['iron', 'gold', 'diamond', 'leather']:
        for k in ['helmet', 'chestplate', 'leggings', 'boots']:
            im = lade('mcl_armor_inv_%s_%s' % (k, m))
            B['i_%s_%s' % (m, k)] = faerben(im, LEDER) if m == 'leather' else im

    # grau abgelegt, hier gefärbt
    B['grass_top'] = faerben(lade('mcl_core_grass_block_top'), GRAS)
    B['grass_side'] = ueber(lade('default_dirt'), faerben(lade('mcl_core_grass_block_side_overlay'), GRAS))
    B['leaves'] = faerben(lade('default_leaves'), LAUB)
    B['tallgrass'] = faerben(lade('mcl_flowers_tallgrass'), GRAS)
    sp = lade('mcl_core_leaves_spruce')
    B['fichtennadeln'] = faerben(sp, FICHTE) if max(max(p[:3]) - min(p[:3]) for p in sp.getdata() if p[3]) < 40 else sp

    # Wasser: 16 Bilder übereinander, das Spiel zeigt 8
    w = lade('mcl_core_water_source_animation')
    for f in range(8):
        B['water%d' % f] = faerben(ausschnitt(w, 0, f * 2 * 16, 16, 16), WASSER)

    # Risse: 10 Stufen übereinander, das Spiel hat 8
    k = lade('crack_anylength')
    for s in range(8):
        B['crack%d' % s] = ausschnitt(k, 0, round(s * 9 / 7) * 16, 16, 16)

    # Weizen: 8 Stufen beim Vorbild, 4 im Spiel
    for s, q in enumerate([1, 3, 5, 7]):
        B['wheat%d' % s] = lade('mcl_farming_wheat_stage_%d' % q)

    # Redstone-Leitung: Punkt und Linien in einem Bild, das Spiel schneidet
    # daraus Kreuz, Gerade oder Ecke. Die Farbe nach der Ladung wie beim Vorbild.
    punkt, linie = lade('redstone_redstone_dust_dot'), lade('redstone_redstone_dust_line0')
    grau = ueber(ueber(punkt, linie), linie.rotate(90))
    for l in range(16):
        f = l / 15
        r = f * 0.6 + (0.4 if f > 0 else 0.3)
        g = max(0.0, f * f * 0.7 - 0.5)
        b = max(0.0, f * f * 0.6 - 0.7)
        B['rs_staub%d' % l] = faerben(grau, (round(r * 255), round(g * 255), round(b * 255)))

    # Truhe: aus dem Modell-Bild (64×64). Deckel 5 Reihen, Unterteil 10,
    # dazwischen eine Naht; seitlich und oben mit Rand auf 16 gebracht.
    t = lade('mcl_chests_normal')
    def seite(x):
        s = Image.new('RGBA', (14, 14))
        s.paste(ausschnitt(t, x, 14, 14, 5), (0, 0))
        s.paste(ausschnitt(t, x, 34, 14, 9), (0, 5))
        return rand_auf(s, 16, 16)
    B['chest_front'] = seite(14)
    B['chest_side'] = seite(0)
    B['chest_top'] = rand_auf(ausschnitt(t, 28, 0, 14, 14), 16, 16)

    # Bett: das Strohbett ist ein Block, 9 Pixel hoch. Oben Kissen und Decke
    # vom Kopfteil, an der Seite Decke, Holzrahmen und zwei Beine.
    bett = lade('mcl_beds_bed_red')
    B['bed_top'] = ausschnitt(bett, 6, 6, 16, 16)
    s = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    s.paste(ausschnitt(bett, 22, 22, 16, 3), (0, 7))                     # Decke
    holz = ausschnitt(bett, 28, 8, 16, 3)
    s.paste(holz, (0, 10))                                               # Rahmen
    for x0 in (0, 13):
        s.paste(ausschnitt(bett, 28 + x0, 11, 3, 3), (x0, 13))            # Beine
    B['bed_side'] = s

    # flache Symbole für Dinge, die das Vorbild dreidimensional zeigt
    stein, schnee = lade('default_stone'), lade('default_snow')
    def platte(quelle, y0, h, dunkel):
        im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        q = quelle.load()
        for y in range(y0, y0 + h):
            for x in range(1, 15):
                r, g, b, a = q[x, y]
                f = 0.72 if y == y0 + h - 1 else (1.12 if y == y0 else 1)
                im.putpixel((x, y), (min(255, int(r * f)), min(255, int(g * f)), min(255, int(b * f)), 255))
        return im
    B['i_druckplatte'] = platte(stein, 10, 3, 0)
    B['i_schneedecke'] = platte(schnee, 11, 3, 0)
    kn = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    q = stein.load()
    for y in range(6, 10):
        for x in range(5, 11):
            r, g, b, a = q[x, y]
            f = 0.7 if (y == 9 or x == 10) else (1.15 if (y == 6 or x == 5) else 1)
            kn.putpixel((x, y), (min(255, int(r * f)), min(255, int(g * f)), min(255, int(b * f)), 255))
    B['i_knopf'] = kn
    wesen(B)
    return B


def gedreht(im):
    """Rumpf der Vierbeiner: beim Vorbild steht er im Bild hochkant"""
    return im.rotate(90, expand=True)


def wesen(B):
    """Tiere und Monster: je Körperteil ein Ausschnitt aus dem Modell-Bild
    (Seite für den Rumpf, Vorderseite für Gesicht, Brust, Beine). Die
    Spielerfigur bleibt gemalt."""
    s = lade('mobs_mc_pig')
    B['m_pig'] = gedreht(ausschnitt(s, 28, 16, 8, 16))
    g = ausschnitt(s, 8, 8, 8, 8)
    g.paste(ausschnitt(s, 17, 17, 4, 3), (2, 4))                          # Rüssel aufs Gesicht
    B['m_pig_face'] = g
    B['m_pig_leg'] = ausschnitt(s, 4, 20, 4, 6)

    s = lade('mobs_mc_cow')
    B['m_kuh'] = gedreht(ausschnitt(s, 18, 14, 10, 18))
    B['m_kuh_face'] = ausschnitt(s, 6, 6, 8, 8)
    B['m_kuh_bein'] = ausschnitt(s, 4, 20, 4, 12)
    B['m_horn'] = ausschnitt(s, 23, 1, 1, 3)
    B['m_euter'] = ausschnitt(s, 53, 1, 4, 6)

    s, fell = lade('mobs_mc_sheep'), lade('mobs_mc_sheep_fur')
    B['m_schaf_haut'] = gedreht(ausschnitt(s, 28, 14, 6, 16))
    B['m_schaf_face'] = ausschnitt(s, 8, 8, 6, 6)
    B['m_schaf_bein'] = ausschnitt(s, 4, 20, 4, 12)
    B['m_schaf_wolle'] = gedreht(ausschnitt(fell, 28, 14, 6, 16))          # hell: das Spiel färbt nach der Wolle

    s = lade('mobs_mc_chicken')
    B['m_huhn'] = gedreht(ausschnitt(s, 0, 15, 6, 8))
    B['m_huhn_face'] = ausschnitt(s, 3, 3, 4, 6)
    B['m_huhn_fluegel'] = ausschnitt(s, 24, 19, 6, 4)
    B['m_huhn_schnabel'] = ausschnitt(s, 16, 2, 4, 2)
    B['m_huhn_lappen'] = ausschnitt(s, 16, 6, 2, 2)
    B['m_huhn_bein'] = ausschnitt(s, 36, 3, 1, 5)
    B['m_huhn_fuss'] = ausschnitt(s, 32, 0, 3, 3)

    s = lade('mobs_mc_zombie')                                             # Kopf: Grundbild und die Lage darüber
    B['m_zsk'] = ueber(ausschnitt(s, 0, 8, 8, 8), ausschnitt(s, 32, 8, 8, 8))
    B['m_zface'] = ueber(ausschnitt(s, 8, 8, 8, 8), ausschnitt(s, 40, 8, 8, 8))
    B['m_zshirt'] = ausschnitt(s, 20, 20, 8, 12)
    B['m_zpants'] = ausschnitt(s, 4, 20, 4, 12)
    B['m_zarm'] = ausschnitt(s, 44, 20, 4, 12)

    s = lade('mobs_mc_skeleton')
    B['m_skelett'] = ausschnitt(s, 0, 8, 8, 8)
    B['m_skelett_face'] = ausschnitt(s, 8, 8, 8, 8)
    B['m_skelett_brust'] = ausschnitt(s, 20, 20, 8, 12)
    B['m_skelett_glied'] = ausschnitt(s, 42, 18, 2, 12)
    B['m_bogen'] = lade('mcl_bows_bow')

    s = lade('mobs_mc_slime')                                              # doppelt so fein wie die anderen
    B['m_schleim'] = ausschnitt(s, 16, 16, 16, 16)
    B['m_schleim_kern'] = ausschnitt(s, 12, 44, 12, 12)
    B['m_schleim_auge'] = ausschnitt(s, 3, 5, 2, 2)

    # Pfeil im Flug: Spitze links wie in texturen.js; Ei im Flug; Herzen über verliebten Tieren
    B['m_pfeil'] = ausschnitt(lade('mcl_bows_arrow'), 0, 2, 31, 6).transpose(Image.FLIP_LEFT_RIGHT)
    B['m_ei'] = ausschnitt(lade('mcl_throwing_egg'), 6, 5, 4, 6)
    B['p_herz'] = rand_auf(lade('heart'), 11, 11)


def packen(im):
    """[w, h, n] + n Farben (RGBA) + w·h Nummern; n = 0: roh RGBA"""
    w, h = im.size
    px = list(im.getdata())
    farben = []
    index = {}
    for p in px:
        if p[3] == 0: p = (0, 0, 0, 0)
        if p not in index:
            index[p] = len(farben); farben.append(p)
    if len(farben) > 255:
        daten = bytes([w, h, 0]) + b''.join(bytes(p) for p in px)
    else:
        daten = bytes([w, h, len(farben)]) + b''.join(bytes(p) for p in farben) + \
            bytes(index[p if p[3] else (0, 0, 0, 0)] for p in px)
    return base64.b64encode(daten).decode()


def main():
    B = bilder()
    zeilen = ["/* Pocketcraft · Vorlagen für die Texturen",
              "   Erzeugt von werkzeug/pp-texturen.py — nicht von Hand ändern.",
              "   Bilder aus „Pixel Perfection“ von XSSheep (CC BY-SA 4.0), wie sie in",
              "   VoxeLibre liegen; teils eingefärbt, zugeschnitten oder zusammengesetzt,",
              "   auch das unter CC BY-SA 4.0. Je Bild: Breite, Höhe, Farben, Nummern.",
              "   texturen.js nimmt sie an Stelle der gleichnamigen gemalten Texturen. */",
              "'use strict';",
              "const VORLAGE = {"]
    for name in sorted(B):
        zeilen.append("  %s: '%s'," % (name if name.isidentifier() else "'" + name + "'", packen(B[name])))
    zeilen.append("};")
    open(ZIEL, 'w').write('\n'.join(zeilen) + '\n')
    print(len(B), 'Bilder,', os.path.getsize(ZIEL) // 1024, 'KB →', os.path.relpath(ZIEL))


if __name__ == '__main__':
    main()
