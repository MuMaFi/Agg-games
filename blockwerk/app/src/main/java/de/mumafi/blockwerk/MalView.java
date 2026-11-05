package de.mumafi.blockwerk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import java.util.ArrayDeque;
import java.util.ArrayList;

/** Ein einfaches Malprogramm für Kostüme und Bühnenbilder: Pinsel, Radierer,
 *  Füllen, Linie, Rechteck und Kreis, mit Rückgängig. Zwei Finger
 *  verschieben und zoomen. */
final class MalView extends View {

  static final int PINSEL = 0, RADIERER = 1, FUELLEN = 2, LINIE = 3, RECHTECK = 4, KREIS = 5;

  int werkzeug = PINSEL;
  int farbe = 0xFF3E8EF7;
  float dicke = 8;
  boolean geaendert;
  Runnable beiAenderung;

  private Bitmap bild;
  private Canvas bildCanvas;
  private boolean buehne;
  private final float d;
  private final ArrayDeque<Bitmap> rueck = new ArrayDeque<>();

  private final Paint stift = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint bildFarbe = new Paint(Paint.FILTER_BITMAP_FLAG);
  private final Paint hilfe = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path pfad = new Path();
  private final Matrix ansicht = new Matrix(), umkehr = new Matrix();
  private float massstab = 1, verschX, verschY;
  private boolean ansichtGesetzt;
  private float startX, startY, letztX, letztY;
  private boolean malt, zweiFinger;
  private final ScaleGestureDetector skalierer;
  private float fokusX, fokusY;
  private Bitmap karo;

  MalView(Context c) {
    super(c);
    d = getResources().getDisplayMetrics().density;
    stift.setStrokeCap(Paint.Cap.ROUND);
    stift.setStrokeJoin(Paint.Join.ROUND);
    hilfe.setStyle(Paint.Style.STROKE);
    skalierer = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override public boolean onScaleBegin(ScaleGestureDetector det) {
        fokusX = det.getFocusX();
        fokusY = det.getFocusY();
        return true;
      }

      @Override public boolean onScale(ScaleGestureDetector det) {
        float neu = Math.max(0.2f, Math.min(12, massstab * det.getScaleFactor()));
        float f = neu / massstab;
        verschX = det.getFocusX() - (fokusX - verschX) * f;
        verschY = det.getFocusY() - (fokusY - verschY) * f;
        fokusX = det.getFocusX();
        fokusY = det.getFocusY();
        massstab = neu;
        invalidate();
        return true;
      }
    });
    setLayerType(LAYER_TYPE_HARDWARE, null);
  }

  /** Lädt ein Kostüm zum Bearbeiten; der Drehpunkt liegt in der Bildmitte. */
  void lade(Kostuem k, boolean istBuehne) {
    buehne = istBuehne;
    int w, h;
    if (istBuehne) {
      w = 960;
      h = 720;
    } else {
      int bw = k.bild.getWidth(), bh = k.bild.getHeight();
      w = (int) Math.min(1400, Math.max(480, 2 * Math.max(k.mx, bw - k.mx) + 4));
      h = (int) Math.min(1400, Math.max(480, 2 * Math.max(k.my, bh - k.my) + 4));
    }
    bild = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    bildCanvas = new Canvas(bild);
    if (istBuehne) {
      Canvas c = bildCanvas;
      c.save();
      c.scale(960f / (480 * k.aufloesung), 720f / (360 * k.aufloesung));
      c.drawBitmap(k.bild, 240 * k.aufloesung - k.mx, 180 * k.aufloesung - k.my, bildFarbe);
      c.restore();
    } else {
      float s = 2 / k.aufloesung;
      bildCanvas.save();
      bildCanvas.translate(w / 2f, h / 2f);
      bildCanvas.scale(s, s);
      bildCanvas.drawBitmap(k.bild, -k.mx, -k.my, bildFarbe);
      bildCanvas.restore();
    }
    rueck.clear();
    geaendert = false;
    ansichtGesetzt = false;
    invalidate();
  }

  /** Das fertige Bild, für Figuren auf den Inhalt zugeschnitten. */
  Kostuem ergebnis(String name) {
    if (buehne) return new Kostuem(name, bild.copy(Bitmap.Config.ARGB_8888, true), 480, 360, 2);
    int w = bild.getWidth(), h = bild.getHeight();
    int[] px = new int[w * h];
    bild.getPixels(px, 0, w, 0, 0, w, h);
    int l = w, o = h, r = -1, u = -1;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        if ((px[y * w + x] >>> 24) != 0) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < o) o = y;
          if (y > u) u = y;
        }
      }
    }
    if (r < 0) {
      Bitmap leer = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888);
      return new Kostuem(name, leer, 1, 1, 2);
    }
    Bitmap zu = Bitmap.createBitmap(bild, l, o, r - l + 1, u - o + 1);
    return new Kostuem(name, zu.copy(Bitmap.Config.ARGB_8888, true), w / 2f - l, h / 2f - o, 2);
  }

  void rueckgaengig() {
    if (rueck.isEmpty()) return;
    Bitmap b = rueck.pop();
    bild.eraseColor(0);
    bildCanvas.drawBitmap(b, 0, 0, null);
    geaendert = true;
    invalidate();
  }

  boolean kannRueckgaengig() { return !rueck.isEmpty(); }

  void leeren() {
    sichern();
    if (buehne) bild.eraseColor(0xFFFFFFFF);
    else bild.eraseColor(0);
    aenderung();
  }

  void spiegeln() {
    sichern();
    Bitmap kopie = bild.copy(Bitmap.Config.ARGB_8888, false);
    bild.eraseColor(0);
    Matrix m = new Matrix();
    m.setScale(-1, 1, bild.getWidth() / 2f, 0);
    bildCanvas.drawBitmap(kopie, m, bildFarbe);
    aenderung();
  }

  private void sichern() {
    rueck.push(bild.copy(Bitmap.Config.ARGB_8888, false));
    while (rueck.size() > (buehne ? 6 : 12)) rueck.removeLast();
  }

  private void aenderung() {
    geaendert = true;
    invalidate();
    if (beiAenderung != null) beiAenderung.run();
  }

  // ------------------------------------------------------------- Zeichnen

  private void ansichtSetzen() {
    if (ansichtGesetzt || bild == null || getWidth() == 0) return;
    float rand = 12 * d;
    massstab = Math.min((getWidth() - 2 * rand) / bild.getWidth(), (getHeight() - 2 * rand) / bild.getHeight());
    verschX = (getWidth() - bild.getWidth() * massstab) / 2;
    verschY = (getHeight() - bild.getHeight() * massstab) / 2;
    ansichtGesetzt = true;
  }

  @Override protected void onSizeChanged(int w, int h, int ow, int oh) { ansichtGesetzt = false; }

  @Override protected void onDraw(Canvas c) {
    c.drawColor(0xFFE9E8F2);
    if (bild == null) return;
    ansichtSetzen();
    ansicht.reset();
    ansicht.postScale(massstab, massstab);
    ansicht.postTranslate(verschX, verschY);
    RectF r = new RectF(0, 0, bild.getWidth(), bild.getHeight());
    ansicht.mapRect(r);
    if (!buehne) {
      if (karo == null) {
        int g = (int) (8 * d);
        karo = Bitmap.createBitmap(2 * g, 2 * g, Bitmap.Config.ARGB_8888);
        Canvas k = new Canvas(karo);
        k.drawColor(0xFFFFFFFF);
        Paint p = new Paint();
        p.setColor(0xFFEDEDF3);
        k.drawRect(0, 0, g, g, p);
        k.drawRect(g, g, 2 * g, 2 * g, p);
      }
      Paint kp = new Paint();
      kp.setShader(new android.graphics.BitmapShader(karo, android.graphics.Shader.TileMode.REPEAT,
          android.graphics.Shader.TileMode.REPEAT));
      c.drawRect(r, kp);
    }
    c.save();
    c.concat(ansicht);
    c.drawBitmap(bild, 0, 0, massstab > 2 ? null : bildFarbe);
    // Vorschau von Linie, Rechteck und Kreis
    if (malt && (werkzeug == LINIE || werkzeug == RECHTECK || werkzeug == KREIS)) {
      formZeichnen(c, startX, startY, letztX, letztY);
    }
    c.restore();
    hilfe.setColor(0xFFB9B8CC);
    hilfe.setStrokeWidth(Math.max(1, d));
    c.drawRect(r, hilfe);
    if (!buehne) {
      // Drehpunkt
      float mx = r.centerX(), my = r.centerY();
      hilfe.setColor(0x885B4BDB);
      c.drawLine(mx - 10 * d, my, mx + 10 * d, my, hilfe);
      c.drawLine(mx, my - 10 * d, mx, my + 10 * d, hilfe);
    }
  }

  private void formZeichnen(Canvas c, float x0, float y0, float x1, float y1) {
    stift.setXfermode(null);
    stift.setColor(farbe);
    if (werkzeug == LINIE) {
      stift.setStyle(Paint.Style.STROKE);
      stift.setStrokeWidth(dicke);
      c.drawLine(x0, y0, x1, y1, stift);
    } else {
      stift.setStyle(Paint.Style.FILL);
      RectF r = new RectF(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
      if (werkzeug == RECHTECK) c.drawRect(r, stift);
      else c.drawOval(r, stift);
    }
  }

  // ------------------------------------------------------------- Berührung

  private float[] bildPunkt(float x, float y) {
    ansicht.invert(umkehr);
    float[] p = {x, y};
    umkehr.mapPoints(p);
    return p;
  }

  @SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent e) {
    if (bild == null) return false;
    if (e.getPointerCount() > 1 || zweiFinger) {
      if (!zweiFinger) {
        zweiFinger = true;
        if (malt) {
          // angefangenen Strich verwerfen
          malt = false;
          if (werkzeug == PINSEL || werkzeug == RADIERER) rueckgaengig();
        }
      }
      skalierer.onTouchEvent(e);
      if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) zweiFinger = false;
      return true;
    }
    float[] p = bildPunkt(e.getX(), e.getY());
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        getParent().requestDisallowInterceptTouchEvent(true);
        startX = letztX = p[0];
        startY = letztY = p[1];
        if (werkzeug == FUELLEN) {
          sichern();
          fuellen((int) p[0], (int) p[1]);
          aenderung();
          return true;
        }
        malt = true;
        if (werkzeug == PINSEL || werkzeug == RADIERER) {
          sichern();
          pfad.reset();
          pfad.moveTo(p[0], p[1]);
          pfad.lineTo(p[0] + 0.01f, p[1]);
          strich();
        }
        invalidate();
        return true;
      case MotionEvent.ACTION_MOVE:
        if (!malt) return true;
        if (werkzeug == PINSEL || werkzeug == RADIERER) {
          pfad.reset();
          pfad.moveTo(letztX, letztY);
          pfad.quadTo(letztX, letztY, (letztX + p[0]) / 2, (letztY + p[1]) / 2);
          pfad.lineTo(p[0], p[1]);
          strich();
        }
        letztX = p[0];
        letztY = p[1];
        invalidate();
        return true;
      case MotionEvent.ACTION_UP:
        if (malt && (werkzeug == LINIE || werkzeug == RECHTECK || werkzeug == KREIS)) {
          sichern();
          formZeichnen(bildCanvas, startX, startY, p[0], p[1]);
        }
        if (malt) aenderung();
        malt = false;
        return true;
      case MotionEvent.ACTION_CANCEL:
        malt = false;
        invalidate();
        return true;
      default:
        return true;
    }
  }

  private void strich() {
    stift.setStyle(Paint.Style.STROKE);
    stift.setStrokeWidth(dicke);
    if (werkzeug == RADIERER) {
      if (buehne) {
        stift.setXfermode(null);
        stift.setColor(0xFFFFFFFF);
      } else {
        stift.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
      }
    } else {
      stift.setXfermode(null);
      stift.setColor(farbe);
    }
    bildCanvas.drawPath(pfad, stift);
    stift.setXfermode(null);
  }

  /** Füllt die zusammenhängende Fläche gleicher Farbe (Zeilenverfahren). */
  private void fuellen(int x, int y) {
    int w = bild.getWidth(), h = bild.getHeight();
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    int[] px = new int[w * h];
    bild.getPixels(px, 0, w, 0, 0, w, h);
    int alt = px[y * w + x];
    int neu = farbe;
    if (aehnlich(alt, neu)) return;
    boolean[] besucht = new boolean[w * h];
    ArrayList<int[]> stapel = new ArrayList<>();
    stapel.add(new int[]{x, y});
    while (!stapel.isEmpty()) {
      int[] s = stapel.remove(stapel.size() - 1);
      int sx = s[0], sy = s[1];
      int l = sx;
      while (l > 0 && !besucht[sy * w + l - 1] && aehnlich(px[sy * w + l - 1], alt)) l--;
      int r = sx;
      while (r < w - 1 && !besucht[sy * w + r + 1] && aehnlich(px[sy * w + r + 1], alt)) r++;
      for (int i = l; i <= r; i++) {
        int k = sy * w + i;
        if (besucht[k] || !aehnlich(px[k], alt)) continue;
        px[k] = neu;
        besucht[k] = true;
        if (sy > 0 && !besucht[k - w] && aehnlich(px[k - w], alt)) stapel.add(new int[]{i, sy - 1});
        if (sy < h - 1 && !besucht[k + w] && aehnlich(px[k + w], alt)) stapel.add(new int[]{i, sy + 1});
      }
    }
    bild.setPixels(px, 0, w, 0, 0, w, h);
  }

  private static boolean aehnlich(int a, int b) {
    int aa = a >>> 24, ba = b >>> 24;
    if (aa < 20 && ba < 20) return true;
    if (Math.abs(aa - ba) > 40) return false;
    return Math.abs(((a >> 16) & 0xFF) - ((b >> 16) & 0xFF)) < 40
        && Math.abs(((a >> 8) & 0xFF) - ((b >> 8) & 0xFF)) < 40
        && Math.abs((a & 0xFF) - (b & 0xFF)) < 40;
  }
}
