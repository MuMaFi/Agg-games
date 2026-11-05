package de.mumafi.blockwerk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.LooperMode;

import java.io.File;
import java.io.FileOutputStream;
import java.time.Duration;

/** Prüft die App auf dem Rechner: Robolectric zeichnet mit echter
 *  Android-Grafik, so entstehen auch Bildschirmfotos unter build/bilder. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-port-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
public class BlockwerkTest {

  @Before public void zuruecksetzen() {
    HauptActivity.projekt = null;
    HauptActivity.motor = null;
    HauptActivity.figur = null;
    Motor.letzterFehler = null;
  }

  private HauptActivity starte() {
    HauptActivity a = Robolectric.buildActivity(HauptActivity.class).setup().get();
    warte(100);
    return a;
  }

  private static void warte(long ms) {
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms));
  }

  @SuppressWarnings("unchecked")
  static <T extends View> T finde(View v, Class<T> k) {
    if (k.isInstance(v)) return (T) v;
    if (v instanceof ViewGroup) {
      ViewGroup g = (ViewGroup) v;
      for (int i = 0; i < g.getChildCount(); i++) {
        T t = finde(g.getChildAt(i), k);
        if (t != null) return t;
      }
    }
    return null;
  }

  static void bild(View v, String name) {
    Bitmap b = Bitmap.createBitmap(v.getWidth(), v.getHeight(), Bitmap.Config.ARGB_8888);
    v.draw(new Canvas(b));
    File f = new File("build/bilder/" + name + ".png");
    f.getParentFile().mkdirs();
    try (FileOutputStream o = new FileOutputStream(f)) {
      b.compress(Bitmap.CompressFormat.PNG, 100, o);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static View wurzel(HauptActivity a) { return a.getWindow().getDecorView(); }

  // ------------------------------------------------------------- Bilder

  @Test public void editorHochformat() {
    HauptActivity a = starte();
    bild(wurzel(a), "1-editor-hoch");
    a.wechsleProjekt(Beispiele.erzeuge(2));
    warte(50);
    bild(wurzel(a), "1-editor-hoch-zahlenraten");
    a.setzeCodeModus(true);
    warte(50);
    bild(wurzel(a), "1-code-hoch");
  }

  @Test @Config(qualifiers = "w891dp-h411dp-land-xhdpi")
  public void editorQuerformat() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(3));
    warte(100);
    bild(wurzel(a), "2-editor-quer-fangspiel");
    a.setzeCodeModus(true);
    warte(100);
    bild(wurzel(a), "2-code-quer");
  }

  @Test public void beispieleLaufenOhneFehler() {
    HauptActivity a = starte();
    for (int i = 0; i < Beispiele.NAMEN.length; i++) {
      a.wechsleProjekt(Beispiele.erzeuge(i));
      warte(50);
      bild(wurzel(a), "3-beispiel-" + i + "-skripte");
      HauptActivity.motor.flagge();
      warte(2500);
      assertNull("Fehler in Beispiel " + Beispiele.NAMEN[i], Motor.letzterFehler);
      bild(wurzel(a), "3-beispiel-" + i + "-laeuft");
      HauptActivity.motor.stoppeAlles();
    }
  }

  @Test public void quadratUndKonsole() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(0));
    Figur z = HauptActivity.projekt.figuren.get(0);
    HauptActivity.motor.flagge();
    warte(3000);
    assertEquals(-50, z.x, 0.5);
    assertEquals(-50, z.y, 0.5);
    assertEquals(1, HauptActivity.motor.konsole.size());
    assertTrue(HauptActivity.motor.konsole.get(0).startsWith("Fertig"));
    bild(wurzel(a), "4-quadrat");
    assertNull(Motor.letzterFehler);
  }

  @Test public void zahlenratenFragtUndZaehlt() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(2));
    Projekt p = HauptActivity.projekt;
    Motor m = HauptActivity.motor;
    m.flagge();
    warte(100);
    double geheim = Werte.zahl(p.variablen.get("geheim"));
    assertTrue(geheim >= 1 && geheim <= 100);
    m.beantworte(Werte.zahlText(geheim == 1 ? 2 : geheim - 1));
    warte(100);
    assertEquals(2.0, Werte.zahl(p.variablen.get("Versuche")), 0);
    m.beantworte(Werte.zahlText(geheim));
    warte(200);
    assertEquals("Richtig! Versuche: 2", p.figuren.get(0).blase);
    assertEquals("Geraten in Versuchen: 2", m.konsole.get(0));
    assertNull(Motor.letzterFehler);
  }

  @Test public void spiraleMalt() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(1));
    HauptActivity.motor.flagge();
    warte(6000);
    Bitmap stift = HauptActivity.motor.stiftBild;
    int gemalt = 0;
    for (int y = 0; y < stift.getHeight(); y += 4)
      for (int x = 0; x < stift.getWidth(); x += 4)
        if ((stift.getPixel(x, y) >>> 24) != 0) gemalt++;
    assertTrue("Stiftspuren: " + gemalt, gemalt > 500);
    assertEquals(242.0, Werte.zahl(HauptActivity.projekt.variablen.get("Länge")), 0.001);
    bild(wurzel(a), "4-spirale-fertig");
  }

  @Test public void fangspielSteuerung() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(3));
    Projekt p = HauptActivity.projekt;
    Figur schlaeger = p.figur("Schläger"), stern = p.figur("Stern");
    Motor m = HauptActivity.motor;
    m.flagge();
    warte(100);
    double sy = stern.y, sx = schlaeger.x;
    m.tasteRunter("rechts");
    warte(500);
    m.tasteHoch("rechts");
    assertTrue("Schläger geht nach rechts", schlaeger.x > sx + 50);
    assertTrue("Stern fällt", stern.y < sy - 30);
    stern.x = schlaeger.x;
    stern.y = schlaeger.y + 8;
    warte(100);
    assertEquals(1.0, Werte.zahl(p.variablen.get("Punkte")), 0.001);
    assertNull(Motor.letzterFehler);
  }

  @Test public void partikelMachenKlone() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(5));
    HauptActivity.motor.flagge();
    warte(3000);
    int klone = 0;
    for (Figur f : HauptActivity.projekt.ebenen) if (f.istKlon) klone++;
    assertEquals(12, klone);
    bild(wurzel(a), "4-partikel");
    HauptActivity.motor.stoppeAlles();
    klone = 0;
    for (Figur f : HauptActivity.projekt.ebenen) if (f.istKlon) klone++;
    assertEquals(0, klone);
  }

  @Test public void zaehlschleifeRechnetSchnell() {
    starte();
    Projekt p = HauptActivity.projekt;
    Figur f = p.figuren.get(0);
    Block hut = new Block("ereignis.flagge");
    Block setze = new Block("var.setze");
    setze.werte[0] = "meine Variable";
    setze.werte[1] = "0";
    Block schleife = new Block("steuerung.wiederhole");
    schleife.werte[0] = "1000";
    Block aendere = new Block("var.aendere");
    aendere.werte[0] = "meine Variable";
    aendere.werte[1] = "1";
    schleife.sub[0] = aendere;
    hut.next = setze;
    setze.next = schleife;
    f.skripte.add(hut);
    HauptActivity.motor.flagge();
    warte(200);
    assertEquals(1000.0, Werte.zahl(p.variablen.get("meine Variable")), 0.001);
  }

  @Test public void speichernUndLaden() throws Exception {
    starte();
    for (int i = 0; i < Beispiele.NAMEN.length; i++) {
      Projekt p = Beispiele.erzeuge(i);
      String json = p.json().toString();
      Projekt q = Projekt.ausJson(new JSONObject(json));
      assertEquals(json, q.json().toString());
    }
  }

  @Test public void werte() {
    assertEquals(3.0, Werte.zahl("3"), 0);
    assertEquals(0.5, Werte.zahl("0,5"), 0);
    assertEquals(0.0, Werte.zahl("Apfel"), 0);
    assertEquals("3", Werte.text(3.0));
    assertEquals("0.1", Werte.text(0.1));
    assertTrue(Werte.gleich("10", 10.0));
    assertTrue(Werte.gleich("apfel", "APFEL"));
    assertTrue(Werte.vergleiche("9", "10") < 0);
    assertTrue(Werte.vergleiche("b", "a") > 0);
    assertTrue(Werte.wahr("ja"));
    assertTrue(!Werte.wahr("falsch"));
  }

  // ------------------------------------------------------------- Ziehen

  private static void ziehe(View v, float[] von, float[] nach) {
    long t = SystemClock.uptimeMillis();
    v.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, von[0], von[1], 0));
    int schritte = 12;
    for (int i = 1; i <= schritte; i++) {
      float x = von[0] + (nach[0] - von[0]) * i / schritte, y = von[1] + (nach[1] - von[1]) * i / schritte;
      // zuerst waagrecht aus der Palette heraus
      if (i == 1) { x = von[0] + 40; y = von[1]; }
      v.dispatchTouchEvent(MotionEvent.obtain(t, t + i * 16, MotionEvent.ACTION_MOVE, x, y, 0));
    }
    v.dispatchTouchEvent(MotionEvent.obtain(t, t + 300, MotionEvent.ACTION_UP, nach[0], nach[1], 0));
  }

  private static void tippe(View v, float[] p) {
    long t = SystemClock.uptimeMillis();
    v.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, p[0], p[1], 0));
    v.dispatchTouchEvent(MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, p[0], p[1], 0));
  }

  @Test public void bloeckeZusammenstecken() {
    HauptActivity a = starte();
    EditorView ed = finde(wurzel(a), EditorView.class);
    assertNotNull(ed);
    bild(wurzel(a), "5-leer");
    Figur f = HauptActivity.figur;
    f.skripte.clear();

    // 1. „gehe 10 Schritte“ auf die Fläche
    ed.zeigeKategorie(Kategorie.BEWEGUNG);
    ziehe(ed, ed.palettenPunkt("bewegung.gehe"), ed.bildschirmPunkt(46, 168));
    assertEquals(1, f.skripte.size());
    Block gehe = f.skripte.get(0);
    assertEquals("bewegung.gehe", gehe.spec.op);

    // 2. Flaggenhut darüber: rastet oben an
    ed.zeigeKategorie(Kategorie.EREIGNISSE);
    float[] hutPunkt = ed.palettenPunkt("ereignis.flagge");
    float hutH = BlockMaler.HUT_H + BlockMaler.BEFEHL_MIN_H;
    ziehe(ed, hutPunkt, ed.bildschirmPunkt(gehe.x + 6 + 5, gehe.y - hutH + BlockMaler.HUT_H + 8 + 4));
    assertEquals(1, f.skripte.size());
    Block hut = f.skripte.get(0);
    assertEquals("ereignis.flagge", hut.spec.op);
    assertEquals(gehe, hut.next);

    // 3. „wiederhole fortlaufend“ unter den Hut: umschließt „gehe“
    ed.zeigeKategorie(Kategorie.STEUERUNG);
    ed.draw(new Canvas(Bitmap.createBitmap(ed.getWidth(), ed.getHeight(), Bitmap.Config.ARGB_8888)));
    ziehe(ed, ed.palettenPunkt("steuerung.fortlaufend"), ed.bildschirmPunkt(hut.ax + 6, hut.ay + hut.h + 8));
    Block schleife = hut.next;
    assertEquals("steuerung.fortlaufend", schleife.spec.op);
    assertEquals(gehe, schleife.sub[0]);
    assertNull(schleife.next);

    // 4. „pralle vom Rand ab“ unter „gehe“ in die Schleife
    ed.zeigeKategorie(Kategorie.BEWEGUNG);
    ed.draw(new Canvas(Bitmap.createBitmap(ed.getWidth(), ed.getHeight(), Bitmap.Config.ARGB_8888)));
    ziehe(ed, ed.palettenPunkt("bewegung.abprallen"), ed.bildschirmPunkt(gehe.ax + 6, gehe.ay + gehe.h + 8));
    assertEquals("bewegung.abprallen", gehe.next.spec.op);

    // 5. Werteblock „Zufallszahl“ in das Feld von „gehe“
    ed.zeigeKategorie(Kategorie.OPERATOREN);
    ed.draw(new Canvas(Bitmap.createBitmap(ed.getWidth(), ed.getHeight(), Bitmap.Config.ARGB_8888)));
    float[] zp = ed.palettenPunkt("op.zufall");
    ziehe(ed, zp, ed.bildschirmPunkt(gehe.ax + gehe.slotX[0] + 6, gehe.ay + gehe.slotY[0] + 8));
    assertNotNull("Werteblock steckt im Feld", gehe.args[0]);
    assertEquals("op.zufall", gehe.args[0].spec.op);

    // 6. Ein überzähliger Block auf die Palette: gelöscht
    ziehe(ed, ed.palettenPunkt("op.plus"), ed.bildschirmPunkt(200, 400));
    assertEquals(2, f.skripte.size());
    Block plus = f.skripte.get(1);
    ed.draw(new Canvas(Bitmap.createBitmap(ed.getWidth(), ed.getHeight(), Bitmap.Config.ARGB_8888)));
    float[] von = ed.bildschirmPunkt(plus.ax + plus.w - 4, plus.ay + plus.h / 2);
    long t = SystemClock.uptimeMillis();
    ed.dispatchTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, von[0], von[1], 0));
    ed.dispatchTouchEvent(MotionEvent.obtain(t, t + 20, MotionEvent.ACTION_MOVE, von[0] - 60, von[1], 0));
    ed.dispatchTouchEvent(MotionEvent.obtain(t, t + 40, MotionEvent.ACTION_MOVE, 100, von[1], 0));
    ed.dispatchTouchEvent(MotionEvent.obtain(t, t + 60, MotionEvent.ACTION_UP, 100, von[1], 0));
    assertEquals(1, f.skripte.size());

    bild(wurzel(a), "6-zusammengesteckt");

    // 7. Antippen startet das Skript
    double x0 = f.x, y0 = f.y;
    tippe(ed, ed.bildschirmPunkt(hut.ax + 30, hut.ay + 30));
    warte(1000);
    assertTrue("Figur bewegt sich", f.x != x0 || f.y != y0);
    assertTrue(HauptActivity.motor.laeuft(hut));
    bild(wurzel(a), "7-laeuft");
    tippe(ed, ed.bildschirmPunkt(hut.ax + 30, hut.ay + 30));
    warte(100);
    assertTrue(!HauptActivity.motor.laeuft(hut));
    assertNull(Motor.letzterFehler);
  }

  @Test public void vollbildMitSteuerkreuz() {
    HauptActivity a = starte();
    a.wechsleProjekt(Beispiele.erzeuge(3));
    a.setzeVollbild(true);
    HauptActivity.motor.flagge();
    warte(800);
    bild(wurzel(a), "8-vollbild");
  }

  @Test public void dialoge() {
    HauptActivity a = starte();
    EditorView ed = finde(wurzel(a), EditorView.class);
    Figur f = HauptActivity.figur;
    f.skripte.clear();
    ed.zeigeKategorie(Kategorie.BEWEGUNG);
    ziehe(ed, ed.palettenPunkt("bewegung.gehe"), ed.bildschirmPunkt(30, 60));
    ziehe(ed, ed.palettenPunkt("bewegung.gehezu"), ed.bildschirmPunkt(30, 160));
    assertEquals(2, f.skripte.size());
    ed.draw(new Canvas(Bitmap.createBitmap(ed.getWidth(), ed.getHeight(), Bitmap.Config.ARGB_8888)));
    Block gehe = f.skripte.get(0), gehezu = f.skripte.get(1);

    // Zahlenfeld antippen, 25 eintragen
    tippe(ed, ed.bildschirmPunkt(gehe.ax + gehe.slotX[0] + 8, gehe.ay + gehe.slotY[0] + 8));
    warte(50);
    android.app.AlertDialog dlg = (android.app.AlertDialog) org.robolectric.shadows.ShadowDialog.getLatestDialog();
    assertNotNull(dlg);
    bild(dlg.getWindow().getDecorView(), "10-zahl");
    android.widget.EditText feld = finde(dlg.getWindow().getDecorView(), android.widget.EditText.class);
    feld.setText("25");
    dlg.getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();
    warte(50);
    assertEquals("25", gehe.werte[0]);

    // Auswahlfeld: „Finger“ wählen
    tippe(ed, ed.bildschirmPunkt(gehezu.ax + gehezu.slotX[0] + 8, gehezu.ay + gehezu.slotY[0] + 8));
    warte(50);
    dlg = (android.app.AlertDialog) org.robolectric.shadows.ShadowDialog.getLatestDialog();
    bild(dlg.getWindow().getDecorView(), "11-auswahl");
    dlg.getListView().performItemClick(null, 1, 1);
    warte(50);
    assertEquals("_finger_", gehezu.werte[0]);

    // Figurenbibliothek
    a.neueFigur();
    warte(50);
    dlg = (android.app.AlertDialog) org.robolectric.shadows.ShadowDialog.getLatestDialog();
    dlg.getListView().performItemClick(null, 0, 0);
    warte(50);
    dlg = (android.app.AlertDialog) org.robolectric.shadows.ShadowDialog.getLatestDialog();
    bild(dlg.getWindow().getDecorView(), "12-bibliothek");
    int vorher = HauptActivity.projekt.figuren.size();
    android.widget.GridLayout raster = finde(dlg.getWindow().getDecorView(), android.widget.GridLayout.class);
    raster.getChildAt(4).performClick();
    warte(50);
    assertEquals(vorher + 1, HauptActivity.projekt.figuren.size());
    assertEquals("Dreieck", HauptActivity.figur.name);

    // Farbwahl
    Auswahl.farbe(a, "Farbe wählen", x -> {});
    warte(50);
    dlg = (android.app.AlertDialog) org.robolectric.shadows.ShadowDialog.getLatestDialog();
    bild(dlg.getWindow().getDecorView(), "13-farben");
    bild(wurzel(a), "14-nach-dialogen");
  }

  @Test public void symbol() {
    HauptActivity a = starte();
    android.graphics.drawable.Drawable sym = a.getDrawable(R.mipmap.ic_launcher);
    int g = 432;
    Bitmap b = Bitmap.createBitmap(g, g, Bitmap.Config.ARGB_8888);
    sym.setBounds(0, 0, g, g);
    sym.draw(new Canvas(b));
    File f = new File("build/bilder/15-symbol.png");
    try (FileOutputStream o = new FileOutputStream(f)) {
      b.compress(Bitmap.CompressFormat.PNG, 100, o);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @Test public void kostuemEditor() {
    starte();
    android.content.Intent in = new android.content.Intent();
    in.putExtra("figur", 0);
    KostuemActivity k = Robolectric.buildActivity(KostuemActivity.class, in).setup().get();
    warte(100);
    bild(k.getWindow().getDecorView(), "9-kostueme");
  }
}
