package de.mumafi.blockwerk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

import java.util.ArrayList;
import java.util.List;
import java.util.WeakHashMap;

/** Die Kacheln für Bühne und Figuren, dazu eine Kachel zum Hinzufügen. */
final class FigurenLeiste extends View {

  interface Wirt {
    void waehleFigur(Figur f);
    void neueFigur();
    void figurMenue(Figur f);
  }

  Projekt projekt;
  Figur auswahl;
  Wirt wirt;

  private final float d, slop;
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint schrift = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint bild = new Paint(Paint.FILTER_BITMAP_FLAG);
  private final RectF r = new RectF();
  private final WeakHashMap<Kostuem, Bitmap> vorschauen = new WeakHashMap<>();
  private float scroll, downX, downY, letztY;
  private boolean bewegt, gedrueckt;
  private int kachelGedrueckt = -1;

  FigurenLeiste(Context c) {
    super(c);
    d = getResources().getDisplayMetrics().density;
    slop = ViewConfiguration.get(c).getScaledTouchSlop();
    schrift.setTextSize(11 * d);
    schrift.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    setContentDescription("Figuren");
  }

  void vorschauenVergessen() { vorschauen.clear(); }

  private List<Figur> kacheln() {
    ArrayList<Figur> l = new ArrayList<>();
    l.add(projekt.buehne);
    l.addAll(projekt.figuren);
    l.add(null); // „+“
    return l;
  }

  private float kachelB() {
    int spalten = spalten();
    return (getWidth() - 6 * d) / spalten;
  }

  private int spalten() { return Math.max(1, (int) ((getWidth() - 6 * d) / (74 * d))); }

  private float kachelH() { return Math.min(84 * d, kachelB() * 1.1f); }

  private float maxScroll() {
    int n = kacheln().size();
    int zeilen = (n + spalten() - 1) / spalten();
    return Math.max(0, zeilen * kachelH() + 6 * d - getHeight());
  }

  @Override protected void onDraw(Canvas c) {
    if (projekt == null) return;
    c.drawColor(0xFFF3F4F6);
    List<Figur> k = kacheln();
    int sp = spalten();
    float kb = kachelB(), kh = kachelH();
    scroll = Math.max(0, Math.min(scroll, maxScroll()));
    for (int i = 0; i < k.size(); i++) {
      float x = 3 * d + (i % sp) * kb, y = 3 * d + (i / sp) * kh - scroll;
      if (y + kh < 0 || y > getHeight()) continue;
      r.set(x + 3 * d, y + 3 * d, x + kb - 3 * d, y + kh - 3 * d);
      Figur f = k.get(i);
      boolean gewaehlt = f != null && f == auswahl;
      p.setColor(i == kachelGedrueckt ? 0xFFE5E7EB : 0xFFFFFFFF);
      c.drawRoundRect(r, 6 * d, 6 * d, p);
      p.setStyle(Paint.Style.STROKE);
      p.setStrokeWidth(gewaehlt ? 2 * d : Math.max(1, d));
      p.setColor(gewaehlt ? 0xFF2563EB : 0xFFD1D5DB);
      c.drawRoundRect(r, 6 * d, 6 * d, p);
      p.setStyle(Paint.Style.FILL);
      if (f == null) {
        p.setColor(0xFF2563EB);
        float cx = r.centerX(), cy = r.centerY() - 6 * d, s = Math.min(r.width(), r.height()) * 0.18f;
        c.drawCircle(cx, cy, s * 1.5f, p);
        p.setColor(0xFFFFFFFF);
        p.setStrokeWidth(2.5f * d);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        c.drawLine(cx - s * 0.7f, cy, cx + s * 0.7f, cy, p);
        c.drawLine(cx, cy - s * 0.7f, cx, cy + s * 0.7f, p);
        p.setStyle(Paint.Style.FILL);
        text(c, "Neue Figur", r, 0xFF2563EB);
        continue;
      }
      Kostuem ko = f.aktuell();
      if (ko != null) {
        int g = (int) Math.max(8, Math.min(r.width() - 14 * d, r.height() - 26 * d));
        Bitmap v = vorschauen.get(ko);
        if (v == null || v.getWidth() != g) {
          v = Darstellung.vorschau(ko, g);
          vorschauen.put(ko, v);
        }
        float bx = r.centerX() - g / 2f, by = r.top + 5 * d;
        c.drawBitmap(v, bx, by, bild);
        if (f.istBuehne) {
          // Bühnenbilder füllen die Vorschau in der Breite; Rahmen zeigt die Fläche
          float bh = g * Math.min(1f, ko.hoehe() / ko.breite());
          float oy = by + (g - bh) / 2;
          p.setStyle(Paint.Style.STROKE);
          p.setStrokeWidth(Math.max(1, d));
          p.setColor(0xFFD1D5DB);
          c.drawRect(bx, oy, bx + g, oy + bh, p);
          p.setStyle(Paint.Style.FILL);
        }
      }
      text(c, f.istBuehne ? "Bühne" : f.name, r, gewaehlt ? 0xFF1D4ED8 : 0xFF374151);
      if (!f.istBuehne && !f.sichtbar) {
        p.setColor(0x99FFFFFF);
        c.drawRoundRect(r, 6 * d, 6 * d, p);
      }
    }
  }

  private void text(Canvas c, String t, RectF r, int farbe) {
    schrift.setColor(farbe);
    float max = r.width() - 8 * d;
    String s = t;
    if (schrift.measureText(s) > max) {
      while (s.length() > 1 && schrift.measureText(s + "…") > max) s = s.substring(0, s.length() - 1);
      s = s + "…";
    }
    c.drawText(s, r.centerX() - schrift.measureText(s) / 2, r.bottom - 7 * d, schrift);
  }

  private int kachelBei(float x, float y) {
    int sp = spalten();
    float kb = kachelB(), kh = kachelH();
    int spalte = (int) ((x - 3 * d) / kb), zeile = (int) ((y + scroll - 3 * d) / kh);
    if (spalte < 0 || spalte >= sp || zeile < 0) return -1;
    int i = zeile * sp + spalte;
    return i < kacheln().size() ? i : -1;
  }

  private final Runnable lang = new Runnable() {
    @Override public void run() {
      if (bewegt || !gedrueckt || kachelGedrueckt < 0) return;
      Figur f = kacheln().get(kachelGedrueckt);
      gedrueckt = false;
      kachelGedrueckt = -1;
      invalidate();
      if (f != null) {
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        wirt.figurMenue(f);
      }
    }
  };

  @SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent e) {
    if (projekt == null) return false;
    float x = e.getX(), y = e.getY();
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        downX = x;
        downY = letztY = y;
        bewegt = false;
        gedrueckt = true;
        kachelGedrueckt = kachelBei(x, y);
        postDelayed(lang, 450);
        invalidate();
        return true;
      case MotionEvent.ACTION_MOVE:
        if (!bewegt && Math.hypot(x - downX, y - downY) > slop) {
          bewegt = true;
          kachelGedrueckt = -1;
          removeCallbacks(lang);
        }
        if (bewegt) {
          scroll = Math.max(0, Math.min(maxScroll(), scroll - (y - letztY)));
          invalidate();
        }
        letztY = y;
        return true;
      case MotionEvent.ACTION_UP:
        removeCallbacks(lang);
        if (gedrueckt && !bewegt && kachelGedrueckt >= 0) {
          Figur f = kacheln().get(kachelGedrueckt);
          if (f == null) wirt.neueFigur();
          else wirt.waehleFigur(f);
        }
        gedrueckt = false;
        kachelGedrueckt = -1;
        invalidate();
        return true;
      case MotionEvent.ACTION_CANCEL:
        removeCallbacks(lang);
        gedrueckt = false;
        kachelGedrueckt = -1;
        invalidate();
        return true;
      default:
        return true;
    }
  }
}
