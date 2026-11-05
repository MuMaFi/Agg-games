package de.mumafi.blockwerk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.OverScroller;

import java.util.ArrayList;
import java.util.List;

/** Der Programmierbereich in einer Ansicht: links die Farbgruppen, daneben
 *  die Palette mit allen Blöcken, rechts die Skriptfläche. Blöcke werden aus
 *  der Palette auf die Fläche gezogen, rasten dort aneinander ein und
 *  verschwinden, wenn man sie zurück auf die Palette zieht. */
final class EditorView extends View {

  interface Wirt {
    void bearbeiteFeld(Block b, int slot);
    void waehleAusMenue(Block b, int slot);
    void waehleFarbe(Block b, int slot);
    void blockMenue(Block b);
    void flaecheMenue();
    void neueVariable();
    void geaendert();
  }

  private static final int KOPF = 0, BLOCK = 1, KNOPF = 2, HINWEIS = 3;

  private static final class Eintrag {
    final int art;
    Kategorie kat;
    Block block;
    String text;
    float y, h;
    boolean haken;
    Eintrag(int art) { this.art = art; }
  }

  /** Wohin ein gezogener Block einrasten würde */
  private static final class Ziel {
    static final int NACH = 0, MUND = 1, UEBER = 2, SLOT = 3;
    final int art;
    final Block block;
    final int i;
    final float x, y;
    Ziel(int art, Block block, int i, float x, float y) { this.art = art; this.block = block; this.i = i; this.x = x; this.y = y; }
  }

  Projekt projekt;
  Figur figur;
  Motor motor;
  Wirt wirt;
  final BlockMaler maler = new BlockMaler();

  private final float d;
  private float katB, palB, palZoom = 0.9f;
  private final ArrayList<Eintrag> palette = new ArrayList<>();
  private final float[] katY = new float[Kategorie.values().length];
  private float palScroll, palHoehe;
  private final OverScroller scroller;
  private VelocityTracker tempo;

  private float panX = Float.NaN, panY, zoom = 1;

  private static final int NICHTS = 0, KAT = 1, PAL_KANDIDAT = 2, PAL_SCROLL = 3, ZIEHEN = 4,
      WS_KANDIDAT = 5, WS_PAN = 6, WS_ZOOM = 7, ZOOMKNOPF = 8, HAKEN = 9;
  private int modus = NICHTS;
  private float downX, downY, letztX, letztY;
  private boolean bewegt;
  private final float slop;
  private Eintrag kandidat;
  private BlockMaler.Treffer wsTreffer;
  private int zoomKnopf;

  private Block gezogen;
  private float greifX, greifY, zugX, zugY;
  private float fingerX, fingerY;
  private Ziel ziel;
  private boolean ueberPalette;

  private Block blasenBlock;
  private String blasenText;
  private float blasenX, blasenY;

  private final ScaleGestureDetector skalierer;
  private float fokusX, fokusY;

  private final Paint grund = new Paint();
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint schrift = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF r = new RectF();
  private final Path pfad = new Path();

  EditorView(Context c) {
    super(c);
    d = getResources().getDisplayMetrics().density;
    slop = ViewConfiguration.get(c).getScaledTouchSlop();
    scroller = new OverScroller(c);
    schrift.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    skalierer = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override public boolean onScaleBegin(ScaleGestureDetector det) {
        fokusX = det.getFocusX();
        fokusY = det.getFocusY();
        return modus == WS_ZOOM;
      }

      @Override public boolean onScale(ScaleGestureDetector det) {
        if (modus != WS_ZOOM) return false;
        float neu = Math.max(0.35f, Math.min(2.5f, zoom * det.getScaleFactor()));
        float f = neu / zoom;
        float fx = det.getFocusX() - wsLinks(), fy = det.getFocusY();
        panX = fx - (fokusX - wsLinks() - panX) * f;
        panY = fy - (fokusY - panY) * f;
        fokusX = det.getFocusX();
        fokusY = det.getFocusY();
        zoom = neu;
        invalidate();
        return true;
      }
    });
    setLayerType(LAYER_TYPE_HARDWARE, null);
  }

  // ============================================================== Aufbau

  void zeige(Projekt p, Figur f) {
    if (figur != null && !Float.isNaN(panX)) { figur.panX = panX; figur.panY = panY; figur.zoom = zoom; }
    projekt = p;
    figur = f;
    maler.projekt = p;
    maler.figur = f;
    panX = f.panX;
    panY = f.panY;
    zoom = f.zoom;
    startLage();
    gezogen = null;
    ziel = null;
    blasenBlock = null;
    modus = NICHTS;
    paletteNeu();
    invalidate();
  }

  private float wsLinks() { return katB + palB; }

  /** Erste Lage der Skriptfläche einer Figur */
  private void startLage() {
    if (!Float.isNaN(panX) || getWidth() == 0) return;
    panX = 20 * d;
    panY = 20 * d;
    // Auf schmalen Flächen (Telefon hochkant) kleiner anfangen
    zoom = (getWidth() - wsLinks()) / d < 320 ? 0.75f : 1;
  }

  @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
    float wdp = w / d;
    katB = (wdp >= 420 ? 60 : 50) * d;
    palB = Math.max(150 * d, Math.min(300 * d, (w - katB) * 0.42f));
    palZoom = palB < 210 * d ? 0.8f : 0.92f;
    startLage();
    if (projekt != null) paletteNeu();
  }

  /** Baut die Palette für die gewählte Figur neu auf. */
  void paletteNeu() {
    if (projekt == null || figur == null) return;
    palette.clear();
    float y = 8;
    for (Kategorie k : Kategorie.values()) {
      katY[k.ordinal()] = y;
      Eintrag kopf = new Eintrag(KOPF);
      kopf.kat = k;
      kopf.y = y;
      kopf.h = 30;
      palette.add(kopf);
      y += kopf.h;
      if (k == Kategorie.BEWEGUNG && figur.istBuehne) {
        Eintrag h = new Eintrag(HINWEIS);
        h.text = "Die Bühne bewegt sich nicht — wähle eine Figur für Bewegungsblöcke.";
        h.y = y;
        h.h = 54;
        palette.add(h);
        y += h.h + 10;
      }
      if (k == Kategorie.VARIABLEN) {
        Eintrag kn = new Eintrag(KNOPF);
        kn.text = "Neue Variable";
        kn.y = y;
        kn.h = 34;
        palette.add(kn);
        y += kn.h + 12;
      }
      for (Spec s : Bloecke.ALLE) {
        if (s.kat != k) continue;
        if (figur.istBuehne && s.nurFigur) continue;
        if (!figur.istBuehne && s.nurBuehne) continue;
        if (s.op.equals("var.wert")) {
          for (String v : projekt.variablen.keySet()) {
            Block b = new Block(s);
            b.werte[0] = v;
            y = eintragen(b, y, true);
          }
          continue;
        }
        if (k == Kategorie.VARIABLEN && projekt.variablen.isEmpty()) continue;
        y = eintragen(vorlage(s), y, false);
      }
      y += 14;
    }
    palHoehe = y;
    palScroll = Math.max(0, Math.min(palScroll, maxPalScroll()));
    invalidate();
  }

  private float eintragen(Block b, float y, boolean haken) {
    maler.messe(b);
    Eintrag e = new Eintrag(BLOCK);
    e.block = b;
    e.kat = b.spec.kat;
    e.haken = haken;
    e.y = y;
    e.h = b.h;
    maler.platziere(b, haken ? 30 : 10, y);
    palette.add(e);
    return y + b.h + (b.spec.istBefehl() ? BlockMaler.KT : 0) + 9;
  }

  private Block vorlage(Spec s) {
    Block b = new Block(s);
    for (int i = 0; i < b.werte.length; i++) {
      String v = b.werte[i];
      if (v.equals("$erste")) b.werte[i] = Menues.erster(s.slotMenue[i], projekt, figur);
      else if (v.equals("$x")) b.werte[i] = Werte.zahlText(Math.round(figur.x));
      else if (v.equals("$y")) b.werte[i] = Werte.zahlText(Math.round(figur.y));
    }
    return b;
  }

  private float maxPalScroll() {
    return Math.max(0, palHoehe * d * palZoom - getHeight() + 40 * d);
  }

  void zeigeKategorie(Kategorie k) {
    scroller.forceFinished(true);
    palScroll = Math.min(maxPalScroll(), Math.max(0, (katY[k.ordinal()] - 4) * d * palZoom));
    invalidate();
  }

  // ============================================================== Zeichnen

  @Override protected void onDraw(Canvas c) {
    if (projekt == null) return;
    if (scroller.computeScrollOffset()) {
      palScroll = scroller.getCurrY();
      postInvalidateOnAnimation();
    }
    int w = getWidth(), h = getHeight();
    startLage();

    // ---- Skriptfläche
    float wl = wsLinks();
    c.save();
    c.clipRect(wl, 0, w, h);
    grund.setColor(0xFFFAFAFA);
    c.drawRect(wl, 0, w, h, grund);
    // Linienraster wie auf Karopapier
    float raster = 24 * d * zoom;
    if (raster > 8) {
      p.setColor(0xFFEDEEF2);
      p.setStrokeWidth(Math.max(1, d * 0.75f));
      float ox = wl + ((panX % raster) + raster) % raster, oy = ((panY % raster) + raster) % raster;
      for (float x = ox; x < w; x += raster) c.drawLine(x, 0, x, h, p);
      for (float y = oy; y < h; y += raster) c.drawLine(wl, y, w, y, p);
    }
    c.translate(wl + panX, panY);
    c.scale(d * zoom, d * zoom);
    for (Block b : figur.skripte) {
      maler.messeStapel(b);
      maler.platziereStapel(b, b.x, b.y);
      maler.zeichneStapel(c, b, motor != null && motor.laeuft(b));
    }
    if (gezogen != null && ziel != null && !ueberPalette) {
      if (ziel.art == Ziel.SLOT) maler.zeichneSlotMarke(c, ziel.block, ziel.i);
      else maler.zeichneSchatten(c, gezogen, ziel.x, ziel.y);
    }
    c.restore();

    if (figur.skripte.isEmpty() && gezogen == null) {
      schrift.setColor(0xFF9CA3AF);
      float mx = wl + (w - wl) / 2, platz = (w - wl) - 24 * d;
      String[] zeilen = {"Ziehe Blöcke hierher.", "Tippe einen Stapel an,", "um ihn zu starten."};
      float y = h / 2f - 20 * d;
      for (int i = 0; i < zeilen.length; i++) {
        schrift.setTextSize((i == 0 ? 15 : 12.5f) * d);
        float tw = schrift.measureText(zeilen[i]);
        if (tw > platz) { schrift.setTextSize(schrift.getTextSize() * platz / tw); tw = platz; }
        c.drawText(zeilen[i], mx - tw / 2, y, schrift);
        y += (i == 0 ? 28 : 19) * d;
      }
    }
    zeichneZoomKnoepfe(c, w, h);

    // ---- Palette
    c.save();
    c.clipRect(katB, 0, wl, h);
    grund.setColor(0xFFF3F4F6);
    c.drawRect(katB, 0, wl, h, grund);
    c.translate(katB, -palScroll);
    c.scale(d * palZoom, d * palZoom);
    float sichtOben = palScroll / (d * palZoom), sichtUnten = (palScroll + h) / (d * palZoom);
    for (Eintrag e : palette) {
      if (e.y + e.h + 10 < sichtOben || e.y > sichtUnten) continue;
      zeichneEintrag(c, e);
    }
    c.restore();
    grund.setColor(0xFFD1D5DB);
    c.drawRect(wl - Math.max(1, d), 0, wl, h, grund);

    // ---- Farbgruppen
    zeichneKategorien(c, h);

    // ---- Papierkorb beim Ziehen über die Palette
    if (gezogen != null && ueberPalette) {
      grund.setColor(0xDDF3F4F6);
      c.drawRect(0, 0, wl, h, grund);
      zeichnePapierkorb(c, wl / 2, h / 2f);
    }

    // ---- gezogener Stapel (ohne Ausschnitt)
    if (gezogen != null) {
      c.save();
      c.translate(wl + panX, panY);
      c.scale(d * zoom, d * zoom);
      maler.messeStapel(gezogen);
      // angehoben: ein weicher Schatten unter dem Stapel
      maler.platziereStapel(gezogen, zugX - greifX + 3, zugY - greifY + 5);
      for (Block b = gezogen; b != null; b = b.next) maler.zeichneSchatten(c, b, b.ax, b.ay);
      maler.platziereStapel(gezogen, zugX - greifX, zugY - greifY);
      maler.zeichneStapel(c, gezogen, false);
      c.restore();
    }

    if (blasenBlock != null) zeichneWertBlase(c);
  }

  private void zeichneEintrag(Canvas c, Eintrag e) {
    switch (e.art) {
      case KOPF:
        schrift.setTextSize(12);
        schrift.setColor(0xFF6B7280);
        String kopf = e.kat.name.toUpperCase(java.util.Locale.GERMAN);
        schrift.setLetterSpacing(0.06f);
        c.drawText(kopf, 10, e.y + 20, schrift);
        schrift.setLetterSpacing(0);
        break;
      case HINWEIS: {
        schrift.setTextSize(11.5f);
        schrift.setColor(0xFF6B7280);
        float breite = palB / (d * palZoom) - 20;
        float y = e.y + 14;
        StringBuilder z = new StringBuilder();
        for (String wort : e.text.split(" ")) {
          if (z.length() > 0 && schrift.measureText(z + " " + wort) > breite) {
            c.drawText(z.toString(), 10, y, schrift);
            y += 15;
            z.setLength(0);
          }
          if (z.length() > 0) z.append(' ');
          z.append(wort);
        }
        c.drawText(z.toString(), 10, y, schrift);
        break;
      }
      case KNOPF: {
        r.set(10, e.y, Math.min(170, palB / (d * palZoom) - 10), e.y + e.h);
        p.setColor(0xFFFFFFFF);
        c.drawRoundRect(r, 4, 4, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.2f);
        p.setColor(0xFFD1D5DB);
        c.drawRoundRect(r, 4, 4, p);
        p.setStyle(Paint.Style.FILL);
        schrift.setTextSize(13);
        schrift.setColor(0xFF374151);
        c.drawText(e.text, r.centerX() - schrift.measureText(e.text) / 2, r.centerY() + 4.5f, schrift);
        break;
      }
      default:
        if (e.haken) {
          boolean an = projekt.monitore.contains(e.block.werte[0]);
          float hy = e.y + e.block.h / 2;
          r.set(8, hy - 8, 24, hy + 8);
          p.setColor(an ? Kategorie.VARIABLEN.farbe : 0xFFFFFFFF);
          c.drawRoundRect(r, 4, 4, p);
          p.setStyle(Paint.Style.STROKE);
          p.setStrokeWidth(1.4f);
          p.setColor(an ? Kategorie.VARIABLEN.rand : 0xFFB5B8CA);
          c.drawRoundRect(r, 4, 4, p);
          if (an) {
            p.setColor(0xFFFFFFFF);
            p.setStrokeWidth(2.2f);
            p.setStrokeCap(Paint.Cap.ROUND);
            c.drawLine(11.5f, hy, 15, hy + 3.5f, p);
            c.drawLine(15, hy + 3.5f, 21, hy - 4, p);
          }
          p.setStyle(Paint.Style.FILL);
        }
        maler.platziere(e.block, e.haken ? 30 : 10, e.y);
        maler.zeichne(c, e.block);
        break;
    }
  }

  private float katHoehe(int h) {
    int n = Kategorie.values().length;
    return Math.min(60 * d, (h - 8 * d) / n);
  }

  private void zeichneKategorien(Canvas c, int h) {
    grund.setColor(0xFFFFFFFF);
    c.drawRect(0, 0, katB, h, grund);
    grund.setColor(0xFFD1D5DB);
    c.drawRect(katB - Math.max(1, d), 0, katB, h, grund);
    float kh = katHoehe(h);
    boolean mitText = kh >= 42 * d;
    Kategorie aktiv = aktiveKategorie();
    Kategorie[] ks = Kategorie.values();
    for (int i = 0; i < ks.length; i++) {
      Kategorie k = ks[i];
      float y0 = 4 * d + i * kh;
      float cx = katB / 2, cy = y0 + (mitText ? kh * 0.38f : kh / 2);
      float rad = Math.min(8 * d, kh * 0.2f);
      if (k == aktiv) {
        p.setColor(0xFFEFF4FF);
        c.drawRect(0, y0, katB - Math.max(1, d), y0 + kh, p);
        p.setColor(0xFF2563EB);
        c.drawRect(0, y0 + 4 * d, 3 * d, y0 + kh - 4 * d, p);
      }
      p.setColor(k.farbe);
      r.set(cx - rad, cy - rad, cx + rad, cy + rad);
      c.drawRoundRect(r, 3 * d, 3 * d, p);
      if (mitText) {
        schrift.setTextSize(Math.min(10 * d, katB / 6.2f));
        schrift.setColor(0xFF4B5563);
        String t = k.name;
        float tw = schrift.measureText(t);
        if (tw > katB - 4 * d) {
          schrift.setTextSize(schrift.getTextSize() * (katB - 4 * d) / tw);
          tw = schrift.measureText(t);
        }
        c.drawText(t, cx - tw / 2, cy + rad + 12 * d, schrift);
      }
    }
  }

  private Kategorie aktiveKategorie() {
    float oben = palScroll / (d * palZoom) + 20;
    Kategorie a = Kategorie.BEWEGUNG;
    for (Kategorie k : Kategorie.values()) if (katY[k.ordinal()] <= oben) a = k;
    return a;
  }

  private void zeichneZoomKnoepfe(Canvas c, int w, int h) {
    String[] z = {"+", "−", "="};
    float rad = 17 * d;
    for (int i = 0; i < 3; i++) {
      float cx = w - 26 * d, cy = h - 26 * d - (2 - i) * 44 * d;
      r.set(cx - rad, cy - rad, cx + rad, cy + rad);
      p.setColor(0xF2FFFFFF);
      c.drawRoundRect(r, 6 * d, 6 * d, p);
      p.setStyle(Paint.Style.STROKE);
      p.setStrokeWidth(Math.max(1, d));
      p.setColor(0xFFD1D5DB);
      c.drawRoundRect(r, 6 * d, 6 * d, p);
      p.setStyle(Paint.Style.FILL);
      schrift.setTextSize(18 * d);
      schrift.setColor(0xFF374151);
      c.drawText(z[i], cx - schrift.measureText(z[i]) / 2, cy + 6 * d, schrift);
    }
  }

  private int zoomKnopfBei(float x, float y) {
    int w = getWidth(), h = getHeight();
    for (int i = 0; i < 3; i++) {
      float cx = w - 26 * d, cy = h - 26 * d - (2 - i) * 44 * d;
      if (Math.hypot(x - cx, y - cy) < 21 * d) return i;
    }
    return -1;
  }

  private void zeichnePapierkorb(Canvas c, float cx, float cy) {
    p.setColor(0xFFDC2626);
    p.setStyle(Paint.Style.STROKE);
    p.setStrokeWidth(2.5f * d);
    p.setStrokeJoin(Paint.Join.ROUND);
    p.setStrokeCap(Paint.Cap.ROUND);
    float s = 16 * d;
    pfad.reset();
    pfad.moveTo(cx - s * 0.75f, cy - s * 0.6f);
    pfad.lineTo(cx - s * 0.6f, cy + s);
    pfad.lineTo(cx + s * 0.6f, cy + s);
    pfad.lineTo(cx + s * 0.75f, cy - s * 0.6f);
    c.drawPath(pfad, p);
    c.drawLine(cx - s, cy - s * 0.6f, cx + s, cy - s * 0.6f, p);
    c.drawLine(cx - s * 0.3f, cy - s * 0.9f, cx + s * 0.3f, cy - s * 0.9f, p);
    c.drawLine(cx - s * 0.2f, cy - s * 0.2f, cx - s * 0.15f, cy + s * 0.65f, p);
    c.drawLine(cx + s * 0.2f, cy - s * 0.2f, cx + s * 0.15f, cy + s * 0.65f, p);
    p.setStyle(Paint.Style.FILL);
    schrift.setTextSize(12 * d);
    schrift.setColor(0xFFB91C1C);
    String t = "Löschen";
    c.drawText(t, cx - schrift.measureText(t) / 2, cy + s + 20 * d, schrift);
  }

  private void zeichneWertBlase(Canvas c) {
    schrift.setTextSize(14 * d);
    String t = blasenText;
    if (t.length() > 60) t = t.substring(0, 60) + "…";
    if (t.isEmpty()) t = " ";
    float tw = schrift.measureText(t);
    float bw = tw + 22 * d, bh = 32 * d;
    float x = Math.max(4 * d, Math.min(getWidth() - bw - 4 * d, blasenX));
    float y = Math.max(4 * d, blasenY - bh - 10 * d);
    r.set(x, y, x + bw, y + bh);
    p.setColor(0x33000000);
    r.offset(0, 2 * d);
    c.drawRoundRect(r, 10 * d, 10 * d, p);
    r.offset(0, -2 * d);
    p.setColor(0xFFFFFFFF);
    c.drawRoundRect(r, 10 * d, 10 * d, p);
    p.setStyle(Paint.Style.STROKE);
    p.setStrokeWidth(1.5f * d);
    p.setColor(blasenBlock.spec.kat.farbe);
    c.drawRoundRect(r, 10 * d, 10 * d, p);
    p.setStyle(Paint.Style.FILL);
    schrift.setColor(0xFF111827);
    c.drawText(t, x + 11 * d, y + bh / 2 + 5 * d, schrift);
  }

  // ============================================================== Berührung

  private float wsX(float x) { return (x - wsLinks() - panX) / (d * zoom); }
  private float wsY(float y) { return (y - panY) / (d * zoom); }
  private float palX(float x) { return (x - katB) / (d * palZoom); }
  private float palY(float y) { return (y + palScroll) / (d * palZoom); }

  private final Runnable langDruck = new Runnable() {
    @Override public void run() {
      if (bewegt) return;
      if (modus == PAL_KANDIDAT && kandidat != null && kandidat.art == BLOCK) {
        performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
        starteZiehenAusPalette(kandidat, letztX, letztY);
      } else if (modus == WS_KANDIDAT && wsTreffer != null) {
        performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
        modus = NICHTS;
        wirt.blockMenue(wsTreffer.block);
      } else if (modus == WS_PAN) {
        performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
        modus = NICHTS;
        wirt.flaecheMenue();
      }
    }
  };

  @SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent e) {
    if (projekt == null) return false;
    float x = e.getX(), y = e.getY();
    if (modus == WS_ZOOM || (e.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN && (modus == WS_PAN || modus == WS_KANDIDAT))) {
      if (modus != WS_ZOOM) { removeCallbacks(langDruck); modus = WS_ZOOM; }
      skalierer.onTouchEvent(e);
      if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) modus = NICHTS;
      return true;
    }
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN: {
        if (blasenBlock != null) { blasenBlock = null; invalidate(); }
        downX = letztX = x;
        downY = letztY = y;
        bewegt = false;
        kandidat = null;
        wsTreffer = null;
        removeCallbacks(langDruck);
        if (tempo != null) tempo.recycle();
        tempo = VelocityTracker.obtain();
        tempo.addMovement(e);
        if (x < katB) {
          modus = KAT;
        } else if (x < wsLinks()) {
          scroller.forceFinished(true);
          kandidat = paletteBei(x, y);
          if (kandidat != null && kandidat.art == BLOCK && kandidat.haken && palX(x) < 28) {
            modus = HAKEN;
          } else if (kandidat != null && (kandidat.art == BLOCK || kandidat.art == KNOPF)) {
            modus = PAL_KANDIDAT;
            if (kandidat.art == BLOCK) postDelayed(langDruck, 320);
          } else {
            modus = PAL_SCROLL;
          }
        } else {
          zoomKnopf = zoomKnopfBei(x, y);
          if (zoomKnopf >= 0) { modus = ZOOMKNOPF; break; }
          wsTreffer = flaecheBei(wsX(x), wsY(y));
          modus = wsTreffer != null ? WS_KANDIDAT : WS_PAN;
          postDelayed(langDruck, 450);
        }
        getParent().requestDisallowInterceptTouchEvent(true);
        break;
      }
      case MotionEvent.ACTION_MOVE: {
        if (tempo != null) tempo.addMovement(e);
        if (!bewegt && Math.hypot(x - downX, y - downY) > slop) {
          bewegt = true;
          removeCallbacks(langDruck);
          if (modus == PAL_KANDIDAT) {
            if (kandidat.art == BLOCK && Math.abs(x - downX) > Math.abs(y - downY) * 0.9f) {
              starteZiehenAusPalette(kandidat, x, y);
            } else {
              modus = PAL_SCROLL;
            }
          } else if (modus == WS_KANDIDAT) {
            starteZiehenAusFlaeche(wsTreffer, x, y);
          }
        }
        if (bewegt) {
          switch (modus) {
            case PAL_SCROLL:
              palScroll = Math.max(0, Math.min(maxPalScroll(), palScroll - (y - letztY)));
              invalidate();
              break;
            case WS_PAN:
              panX += x - letztX;
              panY += y - letztY;
              invalidate();
              break;
            case ZIEHEN:
              ziehen(x, y);
              break;
            default:
              break;
          }
        }
        letztX = x;
        letztY = y;
        break;
      }
      case MotionEvent.ACTION_UP: {
        removeCallbacks(langDruck);
        if (tempo != null) tempo.addMovement(e);
        switch (modus) {
          case KAT:
            if (!bewegt) {
              int i = (int) ((y - 4 * d) / katHoehe(getHeight()));
              Kategorie[] ks = Kategorie.values();
              if (i >= 0 && i < ks.length) zeigeKategorie(ks[i]);
            }
            break;
          case HAKEN:
            if (!bewegt && kandidat != null) {
              String v = kandidat.block.werte[0];
              if (!projekt.monitore.remove(v)) projekt.monitore.add(v);
              invalidate();
              wirt.geaendert();
            }
            break;
          case PAL_KANDIDAT:
            if (!bewegt && kandidat != null) {
              if (kandidat.art == KNOPF) wirt.neueVariable();
              else if (kandidat.block.spec.istWert()) {
                zeigeWert(kandidat.block, x, y);
              } else if (motor != null) {
                Block k = kandidat.block.kopie(false);
                motor.schalteSkript(figur, k);
              }
            }
            break;
          case PAL_SCROLL:
            if (bewegt && tempo != null) {
              tempo.computeCurrentVelocity(1000);
              scroller.fling(0, (int) palScroll, 0, (int) -tempo.getYVelocity(), 0, 0, 0, (int) maxPalScroll());
              postInvalidateOnAnimation();
            }
            break;
          case WS_KANDIDAT:
            if (!bewegt && wsTreffer != null) antippen(wsTreffer, x, y);
            break;
          case ZIEHEN:
            ablegen();
            break;
          case ZOOMKNOPF:
            if (zoomKnopfBei(x, y) == zoomKnopf) zoomKnopf(zoomKnopf);
            break;
          default:
            break;
        }
        modus = NICHTS;
        if (tempo != null) { tempo.recycle(); tempo = null; }
        break;
      }
      case MotionEvent.ACTION_CANCEL:
        removeCallbacks(langDruck);
        if (modus == ZIEHEN) ablegen();
        modus = NICHTS;
        break;
      default:
        break;
    }
    return true;
  }

  private void zoomKnopf(int i) {
    float neu = i == 0 ? Math.min(2.5f, zoom * 1.2f) : i == 1 ? Math.max(0.35f, zoom / 1.2f) : 1;
    // um die Mitte der Fläche zoomen
    float mx = (getWidth() - wsLinks()) / 2f, my = getHeight() / 2f;
    float f = neu / zoom;
    if (i == 2) {
      zoom = 1;
      aufraeumenLage();
    } else {
      panX = mx - (mx - panX) * f;
      panY = my - (my - panY) * f;
      zoom = neu;
    }
    invalidate();
  }

  /** Bringt die Skripte bei Zoom 1 in den Blick. */
  private void aufraeumenLage() {
    float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE;
    for (Block b : figur.skripte) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); }
    if (minX == Float.MAX_VALUE) { panX = 24 * d; panY = 24 * d; return; }
    panX = (20 - minX) * d;
    panY = (24 - minY) * d;
  }

  private Eintrag paletteBei(float x, float y) {
    float px = palX(x), py = palY(y);
    for (Eintrag e : palette) {
      if (e.art == BLOCK) {
        Block b = e.block;
        float l = e.haken ? 4 : b.ax - 2;
        if (px >= l && px <= b.ax + b.w + 4 && py >= b.ay - 3 && py <= b.ay + b.h + 3) return e;
      } else if (e.art == KNOPF) {
        if (py >= e.y && py <= e.y + e.h && px >= 10 && px <= 175) return e;
      }
    }
    return null;
  }

  /** Bringt Größen und Lagen aller Skripte auf den neuesten Stand. */
  private void anordnen() {
    for (Block b : figur.skripte) {
      maler.messeStapel(b);
      maler.platziereStapel(b, b.x, b.y);
    }
  }

  private BlockMaler.Treffer flaecheBei(float x, float y) {
    anordnen();
    for (int i = figur.skripte.size() - 1; i >= 0; i--) {
      BlockMaler.Treffer t = maler.treffeStapel(figur.skripte.get(i), x, y);
      if (t != null) return t;
    }
    return null;
  }

  private void antippen(BlockMaler.Treffer t, float x, float y) {
    Block b = t.block;
    if (t.slot >= 0) {
      char art = b.spec.slotArt[t.slot];
      switch (art) {
        case 'n': case 's': wirt.bearbeiteFeld(b, t.slot); return;
        case 'd': case 'D': wirt.waehleAusMenue(b, t.slot); return;
        case 'f': wirt.waehleFarbe(b, t.slot); return;
        case 'b': break;
        default: return;
      }
    }
    if (motor == null) return;
    if (b.spec.istWert()) {
      // Werteblöcke zeigen ihren Wert, auch wenn sie in einem Feld stecken
      zeigeWert(b, x, y);
      return;
    }
    Block w = wurzel(b);
    if (w != null) motor.schalteSkript(figur, w);
    invalidate();
  }

  private void zeigeWert(Block b, float x, float y) {
    Object v;
    try {
      v = motor.auswerten(b, figur);
    } catch (RuntimeException ex) {
      v = "";
    }
    blasenBlock = b;
    blasenText = Werte.text(v);
    blasenX = x - 20 * d;
    blasenY = y - 10 * d;
    invalidate();
    final Block bb = b;
    postDelayed(() -> { if (blasenBlock == bb) { blasenBlock = null; invalidate(); } }, 3500);
  }

  // ============================================================== Ziehen

  private void starteZiehenAusPalette(Eintrag e, float x, float y) {
    gezogen = e.block.kopie(false);
    greifX = palX(x) - e.block.ax;
    greifY = palY(y) - e.block.ay;
    modus = ZIEHEN;
    bewegt = true;
    ziehen(x, y);
  }

  private void starteZiehenAusFlaeche(BlockMaler.Treffer t, float x, float y) {
    Block b = t.block;
    greifX = wsX(downX) - b.ax;
    greifY = wsY(downY) - b.ay;
    loese(b);
    gezogen = b;
    modus = ZIEHEN;
    if (motor != null) motor.ansicht.laufendGeaendert();
    ziehen(x, y);
  }

  private void ziehen(float x, float y) {
    fingerX = x;
    fingerY = y;
    zugX = wsX(x);
    zugY = wsY(y);
    ueberPalette = x < wsLinks();
    ziel = ueberPalette ? null : sucheZiel();
    invalidate();
  }

  /** Nimmt einen Block (samt allem darunter) aus seinem Skript heraus. */
  private void loese(Block b) {
    List<Block> s = figur.skripte;
    if (s.remove(b)) return;
    for (Block oben : s) if (loese(oben, b)) return;
  }

  private boolean loese(Block in, Block b) {
    for (Block x = in; x != null; x = x.next) {
      if (x.next == b) { x.next = null; return true; }
      for (int i = 0; i < x.args.length; i++) {
        if (x.args[i] == b) { x.args[i] = null; return true; }
        if (x.args[i] != null && loese(x.args[i], b)) return true;
      }
      for (int i = 0; i < x.sub.length; i++) {
        if (x.sub[i] == b) { x.sub[i] = null; return true; }
        if (x.sub[i] != null && loese(x.sub[i], b)) return true;
      }
    }
    return false;
  }

  /** Oberster Block des Skripts, in dem b steckt */
  Block wurzel(Block b) {
    for (Block oben : figur.skripte) if (enthaelt(oben, b)) return oben;
    return null;
  }

  private static boolean enthaelt(Block in, Block b) {
    for (Block x = in; x != null; x = x.next) {
      if (x == b) return true;
      for (Block a : x.args) if (a != null && enthaelt(a, b)) return true;
      for (Block s : x.sub) if (s != null && enthaelt(s, b)) return true;
    }
    return false;
  }

  private Ziel sucheZiel() {
    Block g = gezogen;
    anordnen();
    maler.messeStapel(g);
    float gx = zugX - greifX, gy = zugY - greifY;
    float grenze = 30 / Math.min(1, zoom);
    Ziel best = null;
    float bestAbstand = grenze;
    if (g.spec.istBefehl()) {
      Block ende = g.letzter();
      boolean hut = g.spec.istHut(), kappe = ende.spec.istKappe();
      // Eine einzelne Schleife mit leerem Mund nimmt die Blöcke darunter auf
      boolean umschliesst = umschliesst(g);
      float hoehe = 0;
      for (Block b = g; b != null; b = b.next) hoehe += b.h;
      ArrayList<Block> alle = new ArrayList<>();
      for (Block oben : figur.skripte) if (oben.spec.istBefehl()) befehle(oben, alle);
      if (!hut) {
        for (Block x : alle) {
          if (!x.spec.istKappe() && (!kappe || x.next == null || umschliesst)) {
            float a = (float) Math.hypot(gx - x.ax, gy - (x.ay + x.h));
            if (a < bestAbstand) { bestAbstand = a; best = new Ziel(Ziel.NACH, x, 0, x.ax, x.ay + x.h); }
          }
          for (int i = 0; i < x.sub.length; i++) {
            if (kappe && x.sub[i] != null && !umschliesst) continue;
            float zx = x.ax + BlockMaler.MUND_EINZUG, zy = x.ay + x.mundY[i];
            float a = (float) Math.hypot(gx - zx, gy - zy);
            if (a < bestAbstand) { bestAbstand = a; best = new Ziel(Ziel.MUND, x, i, zx, zy); }
          }
        }
      }
      for (Block oben : figur.skripte) {
        if (!oben.spec.istBefehl() || oben.spec.istHut()) continue;
        if (umschliesst) {
          float mx = gx + BlockMaler.MUND_EINZUG, my = gy + g.mundY[0];
          float a = (float) Math.hypot(mx - oben.ax, my - oben.ay);
          if (a < bestAbstand) {
            bestAbstand = a;
            best = new Ziel(Ziel.UEBER, oben, 1, oben.ax - BlockMaler.MUND_EINZUG, oben.ay - g.mundY[0]);
          }
        } else if (!kappe) {
          float a = (float) Math.hypot(gx - oben.ax, gy + hoehe - oben.ay);
          if (a < bestAbstand) {
            bestAbstand = a;
            best = new Ziel(Ziel.UEBER, oben, 0, oben.ax, oben.ay - hoehe);
          }
        }
      }
    } else {
      ArrayList<Block> alle = new ArrayList<>();
      for (Block oben : figur.skripte) alleBloecke(oben, alle);
      float mx = gx, my = gy + g.h / 2;
      grenze = 26 / Math.min(1, zoom);
      bestAbstand = grenze;
      for (Block x : alle) {
        for (int i = 0; i < x.args.length; i++) {
          if (!x.spec.nimmtBlock(i, g.spec) || x.spec.slotArt[i] == 'v') continue;
          float sx = x.ax + x.slotX[i], sy = x.ay + x.slotY[i] + x.slotH[i] / 2;
          float a = (float) Math.hypot(mx - sx, my - sy);
          // innerhalb eines breiten Feldes zählt auch die waagrechte Überdeckung
          if (mx > sx && mx < sx + x.slotW[i]) a = Math.min(a, Math.abs(my - sy) + 4);
          if (a < bestAbstand) { bestAbstand = a; best = new Ziel(Ziel.SLOT, x, i, sx, sy); }
        }
      }
    }
    return best;
  }

  private static boolean umschliesst(Block g) {
    return g.next == null && g.sub.length > 0 && g.sub[0] == null && !g.spec.istHut();
  }

  private static void befehle(Block in, List<Block> l) {
    for (Block x = in; x != null; x = x.next) {
      l.add(x);
      for (Block s : x.sub) if (s != null) befehle(s, l);
    }
  }

  private static void alleBloecke(Block in, List<Block> l) {
    for (Block x = in; x != null; x = x.next) {
      l.add(x);
      for (Block a : x.args) if (a != null) alleBloecke(a, l);
      for (Block s : x.sub) if (s != null) alleBloecke(s, l);
    }
  }

  private void ablegen() {
    Block g = gezogen;
    if (g == null) return;
    gezogen = null;
    if (ueberPalette) {
      ziel = null;
      wirt.geaendert();
      invalidate();
      return;
    }
    Ziel z = ziel;
    ziel = null;
    float gx = zugX - greifX, gy = zugY - greifY;
    if (z == null) {
      g.x = gx;
      g.y = gy;
      figur.skripte.add(g);
    } else {
      Block ende = g.letzter();
      boolean umschliesst = umschliesst(g);
      switch (z.art) {
        case Ziel.NACH:
          if (umschliesst && z.block.next != null) g.sub[0] = z.block.next;
          else ende.next = z.block.next;
          z.block.next = g;
          break;
        case Ziel.MUND:
          if (umschliesst && z.block.sub[z.i] != null) g.sub[0] = z.block.sub[z.i];
          else ende.next = z.block.sub[z.i];
          z.block.sub[z.i] = g;
          break;
        case Ziel.UEBER: {
          int i = figur.skripte.indexOf(z.block);
          if (z.i == 1) g.sub[0] = z.block;
          else ende.next = z.block;
          g.x = z.x;
          g.y = z.y;
          figur.skripte.remove(i);
          figur.skripte.add(g);
          break;
        }
        case Ziel.SLOT: {
          Block alt = z.block.args[z.i];
          z.block.args[z.i] = g;
          if (alt != null) {
            alt.x = gx + 30;
            alt.y = gy + 40;
            figur.skripte.add(alt);
          }
          break;
        }
        default:
          break;
      }
      performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
    }
    wirt.geaendert();
    invalidate();
  }

  // ============================================================== Befehle von außen

  void aufraeumen() {
    float y = 20;
    for (Block b : figur.skripte) {
      maler.messeStapel(b);
      b.x = 20;
      b.y = y;
      float h = 0;
      for (Block x = b; x != null; x = x.next) h += x.h;
      y += h + 28;
    }
    zoom = 1;
    aufraeumenLage();
    invalidate();
    wirt.geaendert();
  }

  /** Entfernt einen Block; Befehle darunter rücken nach. */
  void loescheBlock(Block b) {
    if (b.spec.istWert()) {
      loese(b);
    } else {
      Block danach = b.next;
      b.next = null;
      int i = figur.skripte.indexOf(b);
      if (i >= 0) {
        figur.skripte.remove(i);
        if (danach != null) {
          danach.x = b.x;
          danach.y = b.y;
          figur.skripte.add(i, danach);
        }
      } else {
        ersetze(b, danach);
      }
    }
    wirt.geaendert();
    invalidate();
  }

  private void ersetze(Block b, Block durch) {
    for (Block oben : figur.skripte) if (ersetze(oben, b, durch)) return;
  }

  private boolean ersetze(Block in, Block b, Block durch) {
    for (Block x = in; x != null; x = x.next) {
      if (x.next == b) { x.next = durch; return true; }
      for (int i = 0; i < x.sub.length; i++) {
        if (x.sub[i] == b) { x.sub[i] = durch; return true; }
        if (x.sub[i] != null && ersetze(x.sub[i], b, durch)) return true;
      }
    }
    return false;
  }

  void dupliziere(Block b) {
    Block k = b.kopie(!b.spec.istWert());
    maler.messeStapel(b);
    k.x = b.ax + 24;
    k.y = b.ay + 24;
    figur.skripte.add(k);
    wirt.geaendert();
    invalidate();
  }

  /** Für Prüfungen: Bildschirmpunkt nahe dem linken Rand eines Palettenblocks. */
  float[] palettenPunkt(String op) {
    for (Eintrag e : palette) {
      if (e.art != BLOCK || !e.block.spec.op.equals(op)) continue;
      maler.platziere(e.block, e.haken ? 30 : 10, e.y);
      float px = e.block.ax + 6, py = e.block.ay + (e.block.spec.istHut() ? BlockMaler.HUT_H : 0) + 8;
      return new float[]{katB + px * d * palZoom, py * d * palZoom - palScroll};
    }
    return null;
  }

  /** Für Prüfungen: Bildschirmpunkt zu einem Punkt der Skriptfläche. */
  float[] bildschirmPunkt(float wx, float wy) {
    return new float[]{wsLinks() + panX + wx * d * zoom, panY + wy * d * zoom};
  }

  /** Mitte der sichtbaren Fläche in Einheiten — dort landen eingefügte Skripte. */
  float[] sichtMitte() {
    return new float[]{wsX(wsLinks() + (getWidth() - wsLinks()) / 3f), wsY(getHeight() / 4f)};
  }
}
