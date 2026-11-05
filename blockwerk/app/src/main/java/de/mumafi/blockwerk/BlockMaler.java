package de.mumafi.blockwerk;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

/** Ordnet Blöcke an (Größe, Lage der Felder und Innenstapel) und zeichnet sie.
 *  Alle Maße sind Einheiten; der Canvas wird vorher passend skaliert. */
final class BlockMaler {

  static final float SCHRIFT = 12.5f;
  static final float LUECKE = 5;
  static final float BEFEHL_MIN_H = 38, BEFEHL_PAD_Y = 7;
  static final float WERT_MIN_H = 28, WERT_PAD_Y = 3;
  static final float SLOT_H = 22, SLOT_MIN_W = 28;
  static final float KX = 14, KB = 18, KT = 5;
  static final float HUT_H = 16, HUT_B = 86;
  static final float MUND_EINZUG = 16, MUND_MIN_H = 24, ARM_H = 22;
  static final float ECKE = 5;

  Projekt projekt;
  Figur figur;

  private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
  private final Paint slotText = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
  private final Paint fuell = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint rand = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint glanz = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path pfad = new Path();
  private final RectF r = new RectF();
  private final float textMitte, slotMitte;

  BlockMaler() {
    text.setTextSize(SCHRIFT);
    text.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    text.setColor(0xFFFFFFFF);
    slotText.setTextSize(SCHRIFT);
    slotText.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
    rand.setStyle(Paint.Style.STROKE);
    rand.setStrokeWidth(1);
    rand.setStrokeJoin(Paint.Join.ROUND);
    glanz.setStyle(Paint.Style.STROKE);
    glanz.setStrokeJoin(Paint.Join.ROUND);
    Paint.FontMetrics fm = text.getFontMetrics();
    textMitte = -(fm.ascent + fm.descent) / 2;
    fm = slotText.getFontMetrics();
    slotMitte = -(fm.ascent + fm.descent) / 2;
  }

  // ============================================================== Anordnen

  /** Misst einen ganzen Stapel und gibt seine Höhe zurück. */
  float messeStapel(Block oben) {
    float h = 0;
    for (Block b = oben; b != null; b = b.next) {
      messe(b);
      h += b.h;
    }
    return h;
  }

  String slotAnzeige(Block b, int i) {
    char art = b.spec.slotArt[i];
    String w = b.werte[i] == null ? "" : b.werte[i];
    if (art == 'd' || art == 'D') return Menues.anzeige(b.spec.slotMenue[i], w, projekt, figur);
    return w;
  }

  void messe(Block b) {
    Spec s = b.spec;
    int n = s.slots();
    if (b.slotX == null || b.slotX.length != n) {
      b.slotX = new float[n]; b.slotY = new float[n]; b.slotW = new float[n]; b.slotH = new float[n];
    }
    int teile = 0;
    for (Spec.Teil[] z : s.zeilen) teile += z.length;
    if (b.teilX == null || b.teilX.length != teile) {
      b.teilX = new float[teile]; b.teilY = new float[teile]; b.teilW = new float[teile];
    }
    int zn = s.zeilen.size();
    if (b.zeileY == null || b.zeileY.length != zn) {
      b.zeileY = new float[zn]; b.zeileH = new float[zn];
      b.mundY = new float[s.muender]; b.mundH = new float[s.muender];
    }
    for (int i = 0; i < n; i++) if (b.args[i] != null) messe(b.args[i]);
    for (int i = 0; i < s.muender; i++) b.mundH[i] = b.sub[i] != null ? messeStapel(b.sub[i]) : MUND_MIN_H;

    boolean wert = s.istWert();
    boolean bool = s.form == Spec.Form.BOOL;
    float minH = wert ? WERT_MIN_H : BEFEHL_MIN_H;
    float padY = wert ? WERT_PAD_Y : BEFEHL_PAD_Y;
    float breite = 0;
    float[] th = new float[teile];
    int t = 0;
    for (int zi = 0; zi < zn; zi++) {
      Spec.Teil[] zeile = s.zeilen.get(zi);
      boolean slotVorn = zeile.length > 0 && zeile[0].art == Spec.SLOT && s.slotArt[zeile[0].slot] != 'v';
      boolean slotHinten = zeile.length > 0 && zeile[zeile.length - 1].art == Spec.SLOT
          && s.slotArt[zeile[zeile.length - 1].slot] != 'v';
      float padL = wert ? (bool ? (slotVorn ? 8 : 12) : (slotVorn ? 4 : 10)) : 8;
      float padR = wert ? (bool ? (slotHinten ? 8 : 12) : (slotHinten ? 4 : 10)) : 8;
      float x = padL, maxH = 0;
      int erster = t;
      for (Spec.Teil teil : zeile) {
        float w, h;
        switch (teil.art) {
          case Spec.TEXT:
            w = text.measureText(teil.text);
            h = SCHRIFT;
            break;
          case Spec.SYMBOL:
            w = 18;
            h = 18;
            break;
          default: {
            int i = teil.slot;
            Block a = b.args[i];
            if (a != null) { w = a.w; h = a.h; }
            else {
              char art = s.slotArt[i];
              switch (art) {
                case 'b': w = 36; h = 22; break;
                case 'f': w = 30; h = SLOT_H - 2; break;
                case 'v': w = text.measureText(b.werte[i]); h = SCHRIFT; break;
                case 'd': case 'D': w = slotText.measureText(slotAnzeige(b, i)) + 26; h = SLOT_H; break;
                default: w = Math.max(SLOT_MIN_W, slotText.measureText(b.werte[i]) + 16); h = SLOT_H; break;
              }
            }
            b.slotW[i] = w;
            b.slotH[i] = h;
            break;
          }
        }
        b.teilX[t] = x;
        b.teilW[t] = w;
        th[t] = h;
        t++;
        x += w + LUECKE;
        maxH = Math.max(maxH, h);
      }
      if (zeile.length > 0) x -= LUECKE;
      x += padR;
      breite = Math.max(breite, x);
      b.zeileH[zi] = Math.max(minH, maxH + padY * 2);
      if (s.muender == 2 && zi == 1) b.zeileH[zi] = Math.max(30, maxH + 12);
      // vorläufige Lage relativ zur Zeile
      for (int k = erster; k < t; k++) b.teilY[k] = (b.zeileH[zi] - th[k]) / 2;
    }

    // Zeilen und Münder untereinander
    float y = s.istHut() ? HUT_H : 0;
    t = 0;
    for (int zi = 0; zi < zn; zi++) {
      b.zeileY[zi] = y;
      for (Spec.Teil teil : s.zeilen.get(zi)) {
        b.teilY[t] += y;
        if (teil.art == Spec.SLOT) {
          b.slotX[teil.slot] = b.teilX[t];
          b.slotY[teil.slot] = b.teilY[t];
        }
        t++;
      }
      y += b.zeileH[zi];
      if (zi < s.muender) {
        b.mundY[zi] = y;
        y += b.mundH[zi];
      }
    }
    // Ein Block mit Mund, aber ohne zweite Beschriftungszeile (wiederhole)
    for (int m = zn; m < s.muender; m++) { b.mundY[m] = y; y += b.mundH[m]; }
    if (s.muender > 0) {
      b.armH = ARM_H;
      y += ARM_H;
      breite = Math.max(breite, MUND_EINZUG + 70);
    }
    if (s.istHut()) breite = Math.max(breite, HUT_B + 20);
    if (wert) breite = Math.max(breite, b.zeileH[0] + (bool ? 10 : 0));
    else breite = Math.max(breite, 46);
    b.w = breite;
    b.h = y;
  }

  /** Setzt die absoluten Lagen (ax, ay) aller Blöcke eines Stapels. */
  void platziereStapel(Block oben, float x, float y) {
    for (Block b = oben; b != null; b = b.next) {
      platziere(b, x, y);
      y += b.h;
    }
  }

  void platziere(Block b, float x, float y) {
    b.ax = x;
    b.ay = y;
    for (int i = 0; i < b.args.length; i++)
      if (b.args[i] != null) platziere(b.args[i], x + b.slotX[i], y + b.slotY[i]);
    for (int i = 0; i < b.sub.length; i++)
      if (b.sub[i] != null) platziereStapel(b.sub[i], x + MUND_EINZUG, y + b.mundY[i]);
  }

  // ============================================================== Formen

  void form(Path p, Block b, float x, float y) {
    p.reset();
    Spec s = b.spec;
    float w = b.w, h = b.h, e = ECKE;
    if (s.form == Spec.Form.WERT) {
      r.set(x, y, x + w, y + h);
      p.addRoundRect(r, h / 2, h / 2, Path.Direction.CW);
      return;
    }
    if (s.form == Spec.Form.BOOL) {
      float m = h / 2;
      p.moveTo(x + m, y);
      p.lineTo(x + w - m, y);
      p.lineTo(x + w, y + m);
      p.lineTo(x + w - m, y + h);
      p.lineTo(x + m, y + h);
      p.lineTo(x, y + m);
      p.close();
      return;
    }
    if (s.istHut()) {
      p.moveTo(x, y + HUT_H);
      p.cubicTo(x + HUT_B * 0.25f, y - HUT_H / 3, x + HUT_B * 0.75f, y - HUT_H / 3, x + HUT_B, y + HUT_H);
      p.lineTo(x + w - e, y + HUT_H);
      p.quadTo(x + w, y + HUT_H, x + w, y + HUT_H + e);
    } else {
      p.moveTo(x, y + e);
      p.quadTo(x, y, x + e, y);
      p.lineTo(x + KX, y);
      p.lineTo(x + KX + 5, y + KT);
      p.lineTo(x + KX + KB - 5, y + KT);
      p.lineTo(x + KX + KB, y);
      p.lineTo(x + w - e, y);
      p.quadTo(x + w, y, x + w, y + e);
    }
    for (int i = 0; i < s.muender; i++) {
      float my = y + b.mundY[i], mh = b.mundH[i], mx = x + MUND_EINZUG;
      p.lineTo(x + w, my - e);
      p.quadTo(x + w, my, x + w - e, my);
      p.lineTo(mx + KX + KB, my);
      p.lineTo(mx + KX + KB - 5, my + KT);
      p.lineTo(mx + KX + 5, my + KT);
      p.lineTo(mx + KX, my);
      p.lineTo(mx + e, my);
      p.quadTo(mx, my, mx, my + e);
      p.lineTo(mx, my + mh - e);
      p.quadTo(mx, my + mh, mx + e, my + mh);
      p.lineTo(mx + KX, my + mh);
      p.lineTo(mx + KX + 5, my + mh + KT);
      p.lineTo(mx + KX + KB - 5, my + mh + KT);
      p.lineTo(mx + KX + KB, my + mh);
      p.lineTo(x + w - e, my + mh);
      p.quadTo(x + w, my + mh, x + w, my + mh + e);
    }
    p.lineTo(x + w, y + h - e);
    p.quadTo(x + w, y + h, x + w - e, y + h);
    if (!s.istKappe()) {
      p.lineTo(x + KX + KB, y + h);
      p.lineTo(x + KX + KB - 5, y + h + KT);
      p.lineTo(x + KX + 5, y + h + KT);
      p.lineTo(x + KX, y + h);
    }
    p.lineTo(x + e, y + h);
    p.quadTo(x, y + h, x, y + h - e);
    p.close();
  }

  // ============================================================== Zeichnen

  void zeichneStapel(Canvas c, Block oben, boolean leuchten) {
    if (leuchten) {
      glanz.setColor(0xFFFFE14D);
      glanz.setStrokeWidth(7);
      for (Block b = oben; b != null; b = b.next) {
        form(pfad, b, b.ax, b.ay);
        c.drawPath(pfad, glanz);
      }
    }
    for (Block b = oben; b != null; b = b.next) zeichne(c, b);
  }

  void zeichne(Canvas c, Block b) {
    Spec s = b.spec;
    Kategorie k = s.kat;
    form(pfad, b, b.ax, b.ay);
    fuell.setColor(k.farbe);
    c.drawPath(pfad, fuell);
    rand.setColor(k.rand);
    c.drawPath(pfad, rand);

    int t = 0;
    for (Spec.Teil[] zeile : s.zeilen) {
      for (Spec.Teil teil : zeile) {
        float tx = b.ax + b.teilX[t], ty = b.ay + b.teilY[t], tw = b.teilW[t];
        switch (teil.art) {
          case Spec.TEXT:
            c.drawText(teil.text, tx, ty + SCHRIFT / 2 + textMitte, text);
            break;
          case Spec.SYMBOL:
            symbol(c, teil.text, tx, ty, k);
            break;
          default:
            slot(c, b, teil.slot, k);
            break;
        }
        t++;
      }
    }
    for (int i = 0; i < b.sub.length; i++) if (b.sub[i] != null) zeichneStapel(c, b.sub[i], false);
  }

  private void slot(Canvas c, Block b, int i, Kategorie k) {
    Block a = b.args[i];
    if (a != null) { zeichne(c, a); return; }
    float x = b.ax + b.slotX[i], y = b.ay + b.slotY[i], w = b.slotW[i], h = b.slotH[i];
    char art = b.spec.slotArt[i];
    r.set(x, y, x + w, y + h);
    switch (art) {
      case 'b': {
        float m = h / 2;
        pfad.reset();
        pfad.moveTo(x + m, y); pfad.lineTo(x + w - m, y); pfad.lineTo(x + w, y + m);
        pfad.lineTo(x + w - m, y + h); pfad.lineTo(x + m, y + h); pfad.lineTo(x, y + m); pfad.close();
        fuell.setColor(k.dunkel);
        c.drawPath(pfad, fuell);
        rand.setColor(k.rand);
        c.drawPath(pfad, rand);
        break;
      }
      case 'f': {
        fuell.setColor(Motor.farbe(b.werte[i]));
        c.drawRoundRect(r, 5, 5, fuell);
        rand.setColor(0xFFFFFFFF);
        rand.setStrokeWidth(2);
        c.drawRoundRect(r, 5, 5, rand);
        rand.setStrokeWidth(1);
        break;
      }
      case 'v':
        c.drawText(b.werte[i], x, y + h / 2 + textMitte, text);
        break;
      case 'd': case 'D': {
        float rad = art == 'D' ? h / 2 : 5;
        fuell.setColor(k.dunkel);
        c.drawRoundRect(r, rad, rad, fuell);
        rand.setColor(k.rand);
        c.drawRoundRect(r, rad, rad, rand);
        slotText.setColor(0xFFFFFFFF);
        c.drawText(slotAnzeige(b, i), x + 9, y + h / 2 + slotMitte, slotText);
        // Pfeil
        float px = x + w - 13, py = y + h / 2 - 2;
        pfad.reset();
        pfad.moveTo(px, py); pfad.lineTo(px + 7, py); pfad.lineTo(px + 3.5f, py + 4.5f); pfad.close();
        fuell.setColor(0xFFFFFFFF);
        c.drawPath(pfad, fuell);
        break;
      }
      default: {
        float rad = art == 'n' ? h / 2 : 5;
        fuell.setColor(0xFFFFFFFF);
        c.drawRoundRect(r, rad, rad, fuell);
        rand.setColor(k.rand);
        c.drawRoundRect(r, rad, rad, rand);
        slotText.setColor(0xFF3B3E4F);
        String wert = b.werte[i];
        float tw = slotText.measureText(wert);
        c.drawText(wert, x + (w - tw) / 2, y + h / 2 + slotMitte, slotText);
        break;
      }
    }
  }

  private void symbol(Canvas c, String welches, float x, float y, Kategorie k) {
    switch (welches) {
      case "flagge": {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0xFF2E7D32);
        c.drawLine(x + 3, y + 1, x + 3, y + 18, p);
        Path f = new Path();
        f.moveTo(x + 3, y + 2);
        f.cubicTo(x + 8, y - 1, x + 11, y + 5, x + 17, y + 2);
        f.lineTo(x + 17, y + 11);
        f.cubicTo(x + 11, y + 14, x + 8, y + 8, x + 3, y + 11);
        f.close();
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF4CC75A);
        c.drawPath(f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.2f);
        p.setColor(0xFF2E7D32);
        c.drawPath(f, p);
        break;
      }
      case "rechts":
      case "links": {
        boolean rechts = welches.equals("rechts");
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.2f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0xFFFFFFFF);
        RectF o = new RectF(x + 3, y + 3, x + 15, y + 15);
        c.drawArc(o, rechts ? -60 : 240, rechts ? 270 : -270, false, p);
        // Pfeilspitze am Anfang des Bogens
        double a = Math.toRadians(rechts ? -60 : 240);
        float sx = (float) (x + 9 + 6 * Math.cos(a)), sy = (float) (y + 9 + 6 * Math.sin(a));
        Path s = new Path();
        float d = rechts ? 1 : -1;
        s.moveTo(sx + 4 * d, sy - 3);
        s.lineTo(sx - 1.5f * d, sy - 3.5f);
        s.lineTo(sx + 1 * d, sy + 2.5f);
        s.close();
        p.setStyle(Paint.Style.FILL);
        c.drawPath(s, p);
        break;
      }
      default:
        break;
    }
  }

  /** Halbdurchsichtiger Umriss: zeigt, wo ein gezogener Block einrastet. */
  void zeichneSchatten(Canvas c, Block b, float x, float y) {
    form(pfad, b, x, y);
    fuell.setColor(0x40000000);
    c.drawPath(pfad, fuell);
  }

  void zeichneSlotMarke(Canvas c, Block b, int i) {
    float x = b.ax + b.slotX[i], y = b.ay + b.slotY[i], w = b.slotW[i], h = b.slotH[i];
    r.set(x - 1.5f, y - 1.5f, x + w + 1.5f, y + h + 1.5f);
    glanz.setColor(0xFFFFFFFF);
    glanz.setStrokeWidth(3);
    c.drawRoundRect(r, h / 2, h / 2, glanz);
  }

  // ============================================================== Treffer

  static final class Treffer {
    final Block block;
    final int slot;
    Treffer(Block block, int slot) { this.block = block; this.slot = slot; }
  }

  Treffer treffeStapel(Block oben, float x, float y) {
    for (Block b = oben; b != null; b = b.next) {
      Treffer t = treffe(b, x, y);
      if (t != null) return t;
    }
    return null;
  }

  Treffer treffe(Block b, float x, float y) {
    if (x < b.ax - 2 || x > b.ax + b.w + 2 || y < b.ay - 2 || y > b.ay + b.h + 2) return null;
    for (int i = 0; i < b.args.length; i++) {
      float sx = b.ax + b.slotX[i], sy = b.ay + b.slotY[i];
      if (x >= sx - 2 && x <= sx + b.slotW[i] + 2 && y >= sy - 3 && y <= sy + b.slotH[i] + 3) {
        if (b.args[i] != null) {
          Treffer t = treffe(b.args[i], x, y);
          if (t != null) return t;
        } else if (b.spec.slotArt[i] != 'v') {
          return new Treffer(b, i);
        }
      }
    }
    for (int i = 0; i < b.sub.length; i++) {
      if (b.sub[i] != null) {
        Treffer t = treffeStapel(b.sub[i], x, y);
        if (t != null) return t;
      }
    }
    if (b.sub.length > 0) {
      // nur Kopfzeilen, linker Rand und unterer Arm gehören zum Block
      float lx = x - b.ax, ly = y - b.ay;
      for (int i = 0; i < b.sub.length; i++) {
        if (ly >= b.mundY[i] && ly < b.mundY[i] + b.mundH[i] && lx > MUND_EINZUG) return null;
      }
    }
    return new Treffer(b, -1);
  }
}
