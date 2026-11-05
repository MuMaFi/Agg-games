package de.mumafi.blockwerk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.util.SparseArray;
import android.view.MotionEvent;
import android.view.View;

import java.util.HashMap;

/** Pfeiltasten und Leertaste zum Antippen — für Spiele, die auf Tasten hören.
 *  Wie bei einer echten Tastatur wiederholt sich eine gehaltene Taste. */
final class Steuerkreuz extends View {

  Motor motor;
  private final float d;
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path pfad = new Path();
  private final RectF r = new RectF();
  private final SparseArray<String> finger = new SparseArray<>();
  private final HashMap<String, Integer> gehalten = new HashMap<>();
  private final HashMap<String, Wiederholung> wiederholungen = new HashMap<>();
  private final Handler handler = new Handler(Looper.getMainLooper());

  Steuerkreuz(Context c) {
    super(c);
    d = getResources().getDisplayMetrics().density;
    setContentDescription("Pfeiltasten und Leertaste");
  }

  private float knopf() { return Math.min(getHeight() / 3.2f, 60 * d); }

  /** Mittelpunkt des Kreuzes und der Leertaste */
  private float kreuzX() { return 14 * d + knopf() * 1.5f; }
  private float mitteY() { return getHeight() / 2f; }
  private float leerX() { return getWidth() - 14 * d - knopf() * 1.1f; }

  @Override protected void onDraw(Canvas c) {
    float k = knopf(), cx = kreuzX(), cy = mitteY();
    taste(c, "oben", cx, cy - k, k, 0);
    taste(c, "unten", cx, cy + k, k, 180);
    taste(c, "links", cx - k, cy, k, 270);
    taste(c, "rechts", cx + k, cy, k, 90);
    boolean an = gehalten.containsKey("leertaste");
    p.setColor(an ? 0xCC5B4BDB : 0x66FFFFFF);
    c.drawCircle(leerX(), cy, k * 1.05f, p);
    p.setColor(an ? 0xFFFFFFFF : 0xDDFFFFFF);
    p.setStyle(Paint.Style.STROKE);
    p.setStrokeWidth(2 * d);
    c.drawCircle(leerX(), cy, k * 1.05f, p);
    p.setStyle(Paint.Style.FILL);
    p.setTextSize(13 * d);
    String t = "Leertaste";
    c.drawText(t, leerX() - p.measureText(t) / 2, cy + 4.5f * d, p);
  }

  private void taste(Canvas c, String name, float x, float y, float k, float winkel) {
    boolean an = gehalten.containsKey(name);
    float h = k * 0.47f;
    r.set(x - h, y - h, x + h, y + h);
    p.setColor(an ? 0xCC5B4BDB : 0x66FFFFFF);
    c.drawRoundRect(r, 10 * d, 10 * d, p);
    p.setStyle(Paint.Style.STROKE);
    p.setStrokeWidth(2 * d);
    p.setColor(0xDDFFFFFF);
    c.drawRoundRect(r, 10 * d, 10 * d, p);
    p.setStyle(Paint.Style.FILL);
    c.save();
    c.rotate(winkel, x, y);
    pfad.reset();
    float s = h * 0.45f;
    pfad.moveTo(x, y - s);
    pfad.lineTo(x + s, y + s * 0.6f);
    pfad.lineTo(x - s, y + s * 0.6f);
    pfad.close();
    p.setColor(0xFFFFFFFF);
    c.drawPath(pfad, p);
    c.restore();
  }

  private String tasteBei(float x, float y) {
    float k = knopf(), cx = kreuzX(), cy = mitteY();
    if (Math.hypot(x - leerX(), y - cy) < k * 1.3f) return "leertaste";
    float dx = x - cx, dy = y - cy;
    if (Math.hypot(dx, dy) > k * 1.9f || Math.hypot(dx, dy) < k * 0.25f) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "rechts" : "links";
    return dy > 0 ? "unten" : "oben";
  }

  private void druecke(String t) {
    if (t == null || motor == null) return;
    Integer n = gehalten.get(t);
    gehalten.put(t, n == null ? 1 : n + 1);
    if (n == null) {
      motor.tasteRunter(t);
      Wiederholung w = new Wiederholung(t);
      wiederholungen.put(t, w);
      handler.postDelayed(w, 420);
    }
    invalidate();
  }

  private void loese(String t) {
    if (t == null || motor == null) return;
    Integer n = gehalten.get(t);
    if (n == null) return;
    if (n <= 1) {
      gehalten.remove(t);
      Wiederholung w = wiederholungen.remove(t);
      if (w != null) handler.removeCallbacks(w);
      motor.tasteHoch(t);
    } else {
      gehalten.put(t, n - 1);
    }
    invalidate();
  }

  private final class Wiederholung implements Runnable {
    final String taste;
    Wiederholung(String t) { taste = t; }
    @Override public void run() {
      if (!gehalten.containsKey(taste) || motor == null) return;
      motor.tasteRunter(taste);
      handler.postDelayed(this, 60);
    }
  }

  void allesLoesen() {
    for (String t : gehalten.keySet()) if (motor != null) motor.tasteHoch(t);
    gehalten.clear();
    wiederholungen.clear();
    finger.clear();
    handler.removeCallbacksAndMessages(null);
    invalidate();
  }

  @SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent e) {
    int i = e.getActionIndex();
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
      case MotionEvent.ACTION_POINTER_DOWN: {
        String t = tasteBei(e.getX(i), e.getY(i));
        if (t == null) return e.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN;
        finger.put(e.getPointerId(i), t);
        druecke(t);
        return true;
      }
      case MotionEvent.ACTION_MOVE:
        // Finger, die auf eine andere Taste rutschen, wechseln die Taste
        for (int j = 0; j < e.getPointerCount(); j++) {
          int id = e.getPointerId(j);
          String alt = finger.get(id);
          if (alt == null) continue;
          String neu = tasteBei(e.getX(j), e.getY(j));
          if (neu != null && !neu.equals(alt)) {
            loese(alt);
            finger.put(id, neu);
            druecke(neu);
          }
        }
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_POINTER_UP: {
        int id = e.getPointerId(i);
        loese(finger.get(id));
        finger.remove(id);
        return true;
      }
      case MotionEvent.ACTION_CANCEL:
        allesLoesen();
        return true;
      default:
        return true;
    }
  }
}
