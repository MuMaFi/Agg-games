package de.mumafi.blockwerk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Der Editor: Werkzeugleiste, Bühne, Figuren und Skriptbereich. */
public class HauptActivity extends Activity implements Motor.Ansicht, EditorView.Wirt, FigurenLeiste.Wirt,
    BuehneView.Wirt, SensorEventListener, CodeAnsicht.Wirt {

  static Projekt projekt;
  static Motor motor;
  static Figur figur;

  private static final int WAHL_FOTO = 1, WAHL_EXPORT = 2, WAHL_IMPORT = 3, KOSTUEME = 4, WAHL_JAVA = 5;
  private static final int AKZENT = 0xFF2563EB;

  private float d;
  private EditorView editor;
  private CodeAnsicht codeAnsicht;
  private FrameLayout bereich;
  private boolean codeModus;
  private SymbolKnopf codeKnopf;
  private BuehneView buehne, gross;
  private FigurenLeiste leiste;
  private Steuerkreuz kreuz;
  private FrameLayout wurzel, vollbildEbene;
  private TextView titel;
  private SymbolKnopf flagge, flaggeGross;
  private boolean vollbild;
  private AlertDialog frageDialog;
  private boolean[] frageErledigt;
  private SensorManager sensoren;
  private float glattX, glattY;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable spaeterSpeichern = this::speichern;

  // ============================================================== Leben

  @Override protected void onCreate(Bundle zustand) {
    super.onCreate(zustand);
    d = getResources().getDisplayMetrics().density;
    if (projekt == null) {
      projekt = ladeZuletzt();
      if (projekt == null) projekt = Projekt.neu();
    }
    if (motor == null) motor = new Motor(projekt);
    motor.ansicht = this;
    if (figur == null || !gehoertZumProjekt(figur)) figur = startFigur();

    editor = new EditorView(this);
    editor.wirt = this;
    editor.motor = motor;
    codeAnsicht = new CodeAnsicht(this, this);
    buehne = new BuehneView(this, false);
    gross = new BuehneView(this, true);
    for (BuehneView b : new BuehneView[]{buehne, gross}) { b.projekt = projekt; b.motor = motor; b.wirt = this; }
    leiste = new FigurenLeiste(this);
    leiste.projekt = projekt;
    leiste.wirt = this;
    leiste.auswahl = figur;
    kreuz = new Steuerkreuz(this);
    kreuz.motor = motor;
    editor.zeige(projekt, figur);
    aufbauen();
    sensoren = (SensorManager) getSystemService(SENSOR_SERVICE);
  }

  private boolean gehoertZumProjekt(Figur f) {
    return f == projekt.buehne || projekt.figuren.contains(f);
  }

  private Figur startFigur() {
    return projekt.figuren.isEmpty() ? projekt.buehne : projekt.figuren.get(0);
  }

  @Override protected void onResume() {
    super.onResume();
    motor.klang.start();
    motor.fortsetzen();
    if (sensoren != null) {
      Sensor s = sensoren.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
      if (s != null) sensoren.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME);
    }
    if (vollbild) leisteVerstecken(true);
  }

  @Override protected void onPause() {
    super.onPause();
    speichern();
    motor.anhalten();
    motor.klang.stopp();
    kreuz.allesLoesen();
    motor.fingerUnten = false;
    if (sensoren != null) sensoren.unregisterListener(this);
  }

  @Override public void onConfigurationChanged(Configuration neu) {
    super.onConfigurationChanged(neu);
    aufbauen();
  }

  @Override public void onBackPressed() {
    if (vollbild) { setzeVollbild(false); return; }
    super.onBackPressed();
  }

  // ============================================================== Aufbau

  private void loesen(View v) {
    if (v != null && v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
  }

  private void aufbauen() {
    for (View v : new View[]{editor, codeAnsicht, buehne, gross, leiste, kreuz}) loesen(v);
    bereich = new FrameLayout(this);
    bereich.addView(editor, new FrameLayout.LayoutParams(-1, -1));
    bereich.addView(codeAnsicht, new FrameLayout.LayoutParams(-1, -1));
    editor.setVisibility(codeModus ? View.GONE : View.VISIBLE);
    codeAnsicht.setVisibility(codeModus ? View.VISIBLE : View.GONE);
    Configuration k = getResources().getConfiguration();
    boolean quer = k.orientation == Configuration.ORIENTATION_LANDSCAPE;
    int w = (int) (k.screenWidthDp * d), h = (int) (k.screenHeightDp * d);
    int leisteH = (int) (52 * d);

    wurzel = new FrameLayout(this);
    wurzel.setBackgroundColor(0xFFF3F4F6);
    LinearLayout spalte = new LinearLayout(this);
    spalte.setOrientation(LinearLayout.VERTICAL);
    spalte.addView(werkzeugleiste(), new LinearLayout.LayoutParams(-1, leisteH));

    if (quer) {
      LinearLayout reihe = new LinearLayout(this);
      reihe.setOrientation(LinearLayout.HORIZONTAL);
      int rechtsB = (int) Math.min(w * 0.42f, (h - leisteH - 110 * d) * 4 / 3f + 8 * d);
      int buehneH = (int) ((rechtsB - 8 * d) * 3 / 4f + 8 * d);
      reihe.addView(bereich, new LinearLayout.LayoutParams(0, -1, 1));
      LinearLayout rechts = new LinearLayout(this);
      rechts.setOrientation(LinearLayout.VERTICAL);
      rechts.addView(buehne, new LinearLayout.LayoutParams(-1, buehneH));
      rechts.addView(leiste, new LinearLayout.LayoutParams(-1, 0, 1));
      reihe.addView(rechts, new LinearLayout.LayoutParams(rechtsB, -1));
      spalte.addView(reihe, new LinearLayout.LayoutParams(-1, 0, 1));
    } else {
      LinearLayout oben = new LinearLayout(this);
      oben.setOrientation(LinearLayout.HORIZONTAL);
      int buehneB = (int) Math.min(w * 0.62f, (h - leisteH) * 0.36f * 4 / 3f + 8 * d);
      int buehneH = (int) ((buehneB - 8 * d) * 3 / 4f + 8 * d);
      oben.addView(buehne, new LinearLayout.LayoutParams(buehneB, buehneH));
      oben.addView(leiste, new LinearLayout.LayoutParams(0, buehneH, 1));
      spalte.addView(oben, new LinearLayout.LayoutParams(-1, buehneH));
      View trenner = new View(this);
      trenner.setBackgroundColor(0xFFD1D5DB);
      spalte.addView(trenner, new LinearLayout.LayoutParams(-1, Math.max(1, (int) d)));
      spalte.addView(bereich, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    wurzel.addView(spalte, new FrameLayout.LayoutParams(-1, -1));

    // Vollbild
    vollbildEbene = new FrameLayout(this);
    vollbildEbene.setBackgroundColor(0xFF000000);
    vollbildEbene.setClickable(true);
    boolean mitKreuz = brauchtKreuz();
    int kreuzH = (int) (quer ? Math.min(h * 0.62f, 230 * d) : Math.min(h * 0.3f, 210 * d));
    FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(-1, -1);
    if (!quer && mitKreuz) gp.bottomMargin = kreuzH;
    vollbildEbene.addView(gross, gp);
    FrameLayout.LayoutParams kp = new FrameLayout.LayoutParams(-1, kreuzH, Gravity.BOTTOM);
    vollbildEbene.addView(kreuz, kp);
    kreuz.setVisibility(mitKreuz ? View.VISIBLE : View.GONE);
    LinearLayout knoepfe = new LinearLayout(this);
    knoepfe.setOrientation(LinearLayout.HORIZONTAL);
    flaggeGross = knopf(SymbolKnopf.FLAGGE, "Start", v -> motor.flagge());
    flaggeGross.dunklerGrund = true;
    SymbolKnopf stoppGross = knopf(SymbolKnopf.STOPP, "Stopp", v -> motor.stoppeAlles());
    stoppGross.dunklerGrund = true;
    SymbolKnopf zu = knopf(SymbolKnopf.KLEIN, "Vollbild verlassen", v -> setzeVollbild(false));
    zu.dunklerGrund = true;
    int kg = (int) (52 * d);
    knoepfe.addView(flaggeGross, new LinearLayout.LayoutParams(kg, kg));
    knoepfe.addView(stoppGross, new LinearLayout.LayoutParams(kg, kg));
    knoepfe.addView(zu, new LinearLayout.LayoutParams(kg, kg));
    FrameLayout.LayoutParams knp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
    knp.setMargins(0, (int) (6 * d), (int) (6 * d), 0);
    vollbildEbene.addView(knoepfe, knp);
    vollbildEbene.setVisibility(vollbild ? View.VISIBLE : View.GONE);
    wurzel.addView(vollbildEbene, new FrameLayout.LayoutParams(-1, -1));

    setContentView(wurzel);
    laufendGeaendert();
  }

  private SymbolKnopf knopf(int art, String text, View.OnClickListener l) {
    SymbolKnopf k = new SymbolKnopf(this, art, text);
    k.setOnClickListener(l);
    return k;
  }

  private View werkzeugleiste() {
    LinearLayout l = new LinearLayout(this);
    l.setOrientation(LinearLayout.HORIZONTAL);
    l.setGravity(Gravity.CENTER_VERTICAL);
    l.setBackgroundColor(0xFF1F2329);
    l.setPadding((int) (14 * d), 0, (int) (4 * d), 0);

    TextView logo = new TextView(this);
    logo.setText("Blockwerk");
    logo.setTextColor(0xFFFFFFFF);
    logo.setTextSize(16);
    logo.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    l.addView(logo);

    titel = new TextView(this);
    titel.setTextColor(0xFF9CA3AF);
    titel.setTextSize(14);
    titel.setSingleLine(true);
    titel.setEllipsize(TextUtils.TruncateAt.END);
    titel.setPadding((int) (12 * d), (int) (6 * d), (int) (8 * d), (int) (6 * d));
    titel.setOnClickListener(v -> projektUmbenennen());
    titelAktualisieren();
    l.addView(titel, new LinearLayout.LayoutParams(0, -2, 1));

    int g = (int) (46 * d);
    flagge = knopf(SymbolKnopf.FLAGGE, "Start", v -> motor.flagge());
    l.addView(flagge, new LinearLayout.LayoutParams(g, g));
    l.addView(knopf(SymbolKnopf.STOPP, "Stopp", v -> motor.stoppeAlles()), new LinearLayout.LayoutParams(g, g));
    codeKnopf = knopf(SymbolKnopf.CODE, "Java-Code", v -> setzeCodeModus(!codeModus));
    codeKnopf.setAktiv(codeModus);
    l.addView(codeKnopf, new LinearLayout.LayoutParams(g, g));
    l.addView(knopf(SymbolKnopf.VOLLBILD, "Vollbild", v -> setzeVollbild(true)), new LinearLayout.LayoutParams(g, g));
    SymbolKnopf menue = knopf(SymbolKnopf.MENUE, "Menü", null);
    menue.setOnClickListener(v -> zeigeMenue(menue));
    l.addView(menue, new LinearLayout.LayoutParams((int) (40 * d), g));
    return l;
  }

  /** Zwischen Blöcken und Java-Code umschalten */
  void setzeCodeModus(boolean an) {
    codeModus = an;
    if (an) codeAnsicht.zeige(projekt);
    editor.setVisibility(an ? View.GONE : View.VISIBLE);
    codeAnsicht.setVisibility(an ? View.VISIBLE : View.GONE);
    if (codeKnopf != null) codeKnopf.setAktiv(an);
  }

  private String laufzeit() throws java.io.IOException {
    try (InputStream ein = getAssets().open("laufzeit.java")) {
      return lies(ein);
    }
  }

  @Override public void codeKopieren() {
    android.content.ClipboardManager k = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
    k.setPrimaryClip(android.content.ClipData.newPlainText("Java", new JavaExport(projekt).programm()));
    meldung("Programmcode kopiert (ohne Bilder und Laufzeit).");
  }

  @Override public void codeExportieren() {
    speichern();
    Intent in = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    in.addCategory(Intent.CATEGORY_OPENABLE);
    in.setType("application/octet-stream");
    in.putExtra(Intent.EXTRA_TITLE, new JavaExport(projekt).klasse + ".java");
    try { startActivityForResult(in, WAHL_JAVA); } catch (Exception e) { meldung("Nicht möglich."); }
  }

  private void titelAktualisieren() {
    if (titel != null) titel.setText(projekt.name);
  }

  private boolean brauchtKreuz() {
    ArrayList<Figur> alle = new ArrayList<>(projekt.figuren);
    alle.add(projekt.buehne);
    for (Figur f : alle) for (Block b : f.skripte)
      if (b.enthaelt("ereignis.taste") || b.enthaelt("fuehlen.taste")) return true;
    return false;
  }

  void setzeVollbild(boolean an) {
    vollbild = an;
    if (an) {
      boolean mitKreuz = brauchtKreuz();
      boolean quer = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
      kreuz.setVisibility(mitKreuz ? View.VISIBLE : View.GONE);
      FrameLayout.LayoutParams gp = (FrameLayout.LayoutParams) gross.getLayoutParams();
      gp.bottomMargin = (!quer && mitKreuz) ? kreuz.getLayoutParams().height : 0;
      gross.setLayoutParams(gp);
    } else {
      kreuz.allesLoesen();
    }
    vollbildEbene.setVisibility(an ? View.VISIBLE : View.GONE);
    leisteVerstecken(an);
    gross.invalidate();
    buehne.invalidate();
  }

  @SuppressWarnings("deprecation")
  private void leisteVerstecken(boolean weg) {
    if (Build.VERSION.SDK_INT >= 30) {
      WindowInsetsController c = getWindow().getInsetsController();
      if (c == null) return;
      if (weg) {
        c.hide(WindowInsets.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      } else {
        c.show(WindowInsets.Type.systemBars());
      }
    } else {
      View v = getWindow().getDecorView();
      v.setSystemUiVisibility(weg ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION : 0);
    }
    if (weg) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  // ============================================================== Motor.Ansicht

  @Override public void neuZeichnen() {
    buehne.invalidate();
    if (vollbild) gross.invalidate();
  }

  @Override public void laufendGeaendert() {
    if (editor != null) editor.invalidate();
    boolean l = motor.laeuft();
    if (flagge != null) flagge.setAktiv(l);
    if (flaggeGross != null) flaggeGross.setAktiv(l);
  }

  @Override public void frage(String text) {
    frageSchliessen();
    EditText feld = new EditText(this);
    feld.setSingleLine(true);
    feld.setInputType(InputType.TYPE_CLASS_TEXT);
    FrameLayout rahmen = new FrameLayout(this);
    rahmen.setPadding((int) (20 * d), (int) (8 * d), (int) (20 * d), 0);
    rahmen.addView(feld);
    // Jeder Dialog merkt sich selbst, ob er schon geantwortet hat — der
    // Schließen-Rückruf kommt verzögert und darf keine neuere Frage beantworten.
    final boolean[] erledigt = {false};
    AlertDialog dlg = new AlertDialog.Builder(this)
        .setTitle(text.isEmpty() ? "Deine Antwort" : text)
        .setView(rahmen)
        .setPositiveButton("OK", (x, y) -> {
          if (!erledigt[0]) { erledigt[0] = true; motor.beantworte(feld.getText().toString()); }
        })
        .create();
    dlg.setOnDismissListener(x -> {
      if (!erledigt[0]) { erledigt[0] = true; motor.beantworte(feld.getText().toString()); }
      if (frageDialog == dlg) { frageDialog = null; frageErledigt = null; }
    });
    feld.setOnEditorActionListener((v, id, ev) -> {
      if (!erledigt[0]) { erledigt[0] = true; motor.beantworte(feld.getText().toString()); }
      dlg.dismiss();
      return true;
    });
    if (dlg.getWindow() != null) {
      dlg.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
      dlg.getWindow().setGravity(Gravity.BOTTOM);
    }
    frageDialog = dlg;
    frageErledigt = erledigt;
    dlg.show();
    feld.requestFocus();
  }

  @Override public void frageSchliessen() {
    if (frageDialog != null) {
      if (frageErledigt != null) frageErledigt[0] = true;
      frageDialog.dismiss();
      frageDialog = null;
      frageErledigt = null;
    }
  }

  @Override public void meldung(String text) {
    Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
  }

  // ============================================================== EditorView.Wirt

  @Override public void bearbeiteFeld(Block b, int slot) {
    boolean zahl = b.spec.slotArt[slot] == 'n';
    Auswahl.eingabe(this, zahl ? "Zahl eingeben" : "Text eingeben", b.werte[slot], zahl, t -> {
      b.werte[slot] = zahl ? t.trim() : t;
      editor.invalidate();
      geaendert();
    });
  }

  @Override public void waehleAusMenue(Block b, int slot) {
    String menue = b.spec.slotMenue[slot];
    List<String[]> l = Menues.eintraege(menue, projekt, figur);
    if (l.isEmpty()) {
      meldung(menue.equals("kostuem") ? "Diese Figur hat keine Kostüme." : "Keine Auswahl vorhanden.");
      return;
    }
    String[] namen = new String[l.size()];
    for (int i = 0; i < namen.length; i++) namen[i] = l.get(i)[1];
    Auswahl.liste(this, null, namen, i -> {
      String wert = l.get(i)[0];
      if (wert.equals(Menues.NEU)) {
        if (menue.equals("variable")) {
          neueVariable(name -> { b.werte[slot] = name; editor.invalidate(); });
        } else {
          Auswahl.eingabe(this, "Neue Nachricht", "Nachricht" + (projekt.nachrichten.size() + 1), false, t -> {
            String n = t.trim();
            if (n.isEmpty()) return;
            if (!projekt.nachrichten.contains(n)) projekt.nachrichten.add(n);
            b.werte[slot] = n;
            editor.invalidate();
            geaendert();
          });
        }
        return;
      }
      b.werte[slot] = wert;
      editor.invalidate();
      geaendert();
    });
  }

  @Override public void waehleFarbe(Block b, int slot) {
    Auswahl.farbe(this, "Farbe wählen", f -> {
      b.werte[slot] = Auswahl.hex(f);
      editor.invalidate();
      geaendert();
    });
  }

  @Override public void blockMenue(Block b) {
    ArrayList<String> punkte = new ArrayList<>(Arrays.asList("Duplizieren", "Block löschen"));
    boolean variable = b.spec.op.equals("var.wert");
    if (variable) { punkte.add("Variable umbenennen"); punkte.add("Variable löschen"); }
    Block wurzel = editor.wurzel(b);
    if (wurzel != null && wurzel != b && b.spec.istBefehl()) punkte.add("Ganzes Skript löschen");
    Auswahl.liste(this, null, punkte.toArray(new String[0]), i -> {
      switch (punkte.get(i)) {
        case "Duplizieren": editor.dupliziere(b); break;
        case "Block löschen": editor.loescheBlock(b); break;
        case "Variable umbenennen": variableUmbenennen(b.werte[0]); break;
        case "Variable löschen": variableLoeschen(b.werte[0]); break;
        case "Ganzes Skript löschen":
          figur.skripte.remove(wurzel);
          editor.invalidate();
          geaendert();
          break;
        default: break;
      }
    });
  }

  @Override public void flaecheMenue() {
    String[] punkte = {"Aufräumen", "Alle Skripte dieser Figur löschen"};
    Auswahl.liste(this, null, punkte, i -> {
      if (i == 0) editor.aufraeumen();
      else Auswahl.frage(this, "Alles löschen?", "Alle Skripte von „" + (figur.istBuehne ? "Bühne" : figur.name)
          + "“ werden gelöscht.", "Löschen", () -> {
        figur.skripte.clear();
        editor.invalidate();
        geaendert();
      });
    });
  }

  @Override public void neueVariable() {
    neueVariable(null);
  }

  private void neueVariable(Auswahl.Text danach) {
    Auswahl.eingabe(this, "Neue Variable", "", false, t -> {
      String n = t.trim();
      if (n.isEmpty()) return;
      if (projekt.variablen.containsKey(n)) {
        meldung("Diese Variable gibt es schon.");
        return;
      }
      projekt.variablen.put(n, 0.0);
      projekt.monitore.add(n);
      editor.paletteNeu();
      editor.zeigeKategorie(Kategorie.VARIABLEN);
      buehne.invalidate();
      if (danach != null) danach.fertig(n);
      geaendert();
    });
  }

  private void variableUmbenennen(String alt) {
    Auswahl.eingabe(this, "Variable umbenennen", alt, false, t -> {
      String neu = t.trim();
      if (neu.isEmpty() || neu.equals(alt)) return;
      if (projekt.variablen.containsKey(neu)) { meldung("Diese Variable gibt es schon."); return; }
      LinkedHashMap<String, Object> kopie = new LinkedHashMap<>(projekt.variablen);
      projekt.variablen.clear();
      for (Map.Entry<String, Object> e : kopie.entrySet())
        projekt.variablen.put(e.getKey().equals(alt) ? neu : e.getKey(), e.getValue());
      if (projekt.monitore.remove(alt)) projekt.monitore.add(neu);
      ArrayList<Figur> alle = new ArrayList<>(projekt.figuren);
      alle.add(projekt.buehne);
      for (Figur f : alle) for (Block b : f.skripte) b.ersetzeWert("variable", alt, neu);
      editor.paletteNeu();
      buehne.invalidate();
      geaendert();
    });
  }

  private void variableLoeschen(String name) {
    projekt.variablen.remove(name);
    projekt.monitore.remove(name);
    editor.paletteNeu();
    buehne.invalidate();
    geaendert();
  }

  @Override public void geaendert() {
    buehne.invalidate();
    handler.removeCallbacks(spaeterSpeichern);
    handler.postDelayed(spaeterSpeichern, 8000);
  }

  // ============================================================== Figuren

  @Override public void waehleFigur(Figur f) {
    if (f == figur) {
      figurMenue(f);
      return;
    }
    figur = f;
    leiste.auswahl = f;
    leiste.invalidate();
    editor.zeige(projekt, f);
  }

  @Override public void figurVerschoben(Figur f) {
    if (f != figur) waehleFigur(f);
    else editor.paletteNeu();
    geaendert();
  }

  @Override public void neueFigur() {
    String[] wege = {"Aus der Bibliothek", "Selbst malen", "Foto oder Bild wählen"};
    Auswahl.liste(this, "Neue Figur", wege, i -> {
      if (i == 0) figurAusBibliothek();
      else if (i == 1) {
        Figur f = new Figur(projekt.freierName("Figur"), false);
        Bitmap leer = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888);
        f.kostueme.add(new Kostuem("Kostüm1", leer, 1, 1, 2));
        figurHinzufuegen(f);
        oeffneKostueme(true);
      } else {
        Intent in = new Intent(Intent.ACTION_GET_CONTENT);
        in.setType("image/*");
        in.addCategory(Intent.CATEGORY_OPENABLE);
        try {
          startActivityForResult(Intent.createChooser(in, "Bild wählen"), WAHL_FOTO);
        } catch (Exception e) {
          meldung("Keine App zum Auswählen von Bildern gefunden.");
        }
      }
    });
  }

  private void figurAusBibliothek() {
    List<String> namen = new ArrayList<>();
    List<Bitmap> bilder = new ArrayList<>();
    for (String[] f : Bibliothek.FIGUREN) {
      namen.add(f[0]);
      bilder.add(Darstellung.vorschau(Bibliothek.kostuem(f[1]), (int) (72 * d)));
    }
    Auswahl.bilder(this, "Figur wählen", namen, bilder, i -> {
      String[] e = Bibliothek.FIGUREN[i];
      Figur f = new Figur(projekt.freierName(e[0]), false);
      for (int k = 1; k < e.length; k++) f.kostueme.add(Bibliothek.kostuem(e[k]));
      f.x = Math.round(Math.random() * 300 - 150);
      f.y = Math.round(Math.random() * 200 - 100);
      figurHinzufuegen(f);
    });
  }

  private void figurHinzufuegen(Figur f) {
    projekt.neueFigur(f);
    figur = f;
    leiste.auswahl = f;
    leiste.invalidate();
    editor.zeige(projekt, f);
    buehne.invalidate();
    geaendert();
  }

  @Override public void figurMenue(Figur f) {
    if (f.istBuehne) {
      Auswahl.liste(this, "Bühne", new String[]{"Bühnenbilder bearbeiten"}, i -> {
        if (f != figur) waehleFigur(f);
        oeffneKostueme(false);
      });
      return;
    }
    String[] punkte = {"Kostüme bearbeiten", "Umbenennen", f.sichtbar ? "Verstecken" : "Zeigen", "Duplizieren", "Löschen"};
    Auswahl.liste(this, f.name, punkte, i -> {
      switch (i) {
        case 0:
          if (f != figur) waehleFigur(f);
          oeffneKostueme(false);
          break;
        case 1:
          Auswahl.eingabe(this, "Figur umbenennen", f.name, false, t -> {
            String n = t.trim();
            if (n.isEmpty() || n.equals(f.name)) return;
            if (projekt.figur(n) != null || n.equals("Bühne")) { meldung("Der Name ist schon vergeben."); return; }
            String alt = f.name;
            f.name = n;
            ArrayList<Figur> alle = new ArrayList<>(projekt.figuren);
            alle.add(projekt.buehne);
            for (String m : new String[]{"ziel", "zielRichtung", "beruehrt", "entfernung", "klon", "objekt"})
              for (Figur g : alle) for (Block b : g.skripte) b.ersetzeWert(m, alt, n);
            leiste.invalidate();
            editor.paletteNeu();
            geaendert();
          });
          break;
        case 2:
          f.sichtbar = !f.sichtbar;
          buehne.invalidate();
          leiste.invalidate();
          geaendert();
          break;
        case 3:
          figurHinzufuegen(f.duplikat(projekt.freierName(f.name)));
          break;
        default:
          Auswahl.frage(this, "Figur löschen?", "„" + f.name + "“ und alle ihre Skripte werden gelöscht.", "Löschen", () -> {
            motor.stoppeAlles();
            projekt.entferneFigur(f);
            figur = startFigur();
            leiste.auswahl = figur;
            leiste.invalidate();
            editor.zeige(projekt, figur);
            buehne.invalidate();
            geaendert();
          });
          break;
      }
    });
  }

  private void oeffneKostueme(boolean malen) {
    Intent in = new Intent(this, KostuemActivity.class);
    in.putExtra("figur", figur.istBuehne ? -1 : projekt.figuren.indexOf(figur));
    in.putExtra("malen", malen);
    startActivityForResult(in, KOSTUEME);
  }

  // ============================================================== Ergebnisse

  @Override protected void onActivityResult(int code, int ergebnis, Intent daten) {
    super.onActivityResult(code, ergebnis, daten);
    if (code == KOSTUEME) {
      leiste.vorschauenVergessen();
      leiste.invalidate();
      editor.paletteNeu();
      buehne.invalidate();
      geaendert();
      return;
    }
    if (ergebnis != RESULT_OK || daten == null || daten.getData() == null) return;
    Uri uri = daten.getData();
    switch (code) {
      case WAHL_FOTO: {
        Bitmap b = ladeBild(this, uri, 480);
        if (b == null) { meldung("Das Bild ließ sich nicht öffnen."); return; }
        Figur f = new Figur(projekt.freierName("Foto"), false);
        f.kostueme.add(new Kostuem("Foto", b, b.getWidth() / 2f, b.getHeight() / 2f, 2));
        figurHinzufuegen(f);
        break;
      }
      case WAHL_EXPORT:
        try (OutputStream aus = getContentResolver().openOutputStream(uri)) {
          if (aus == null) throw new java.io.IOException();
          aus.write(projekt.json().toString().getBytes(StandardCharsets.UTF_8));
          meldung("Exportiert.");
        } catch (Exception e) {
          meldung("Export fehlgeschlagen.");
        }
        break;
      case WAHL_JAVA:
        try (OutputStream aus = getContentResolver().openOutputStream(uri)) {
          if (aus == null) throw new java.io.IOException();
          aus.write(new JavaExport(projekt).datei(laufzeit()).getBytes(StandardCharsets.UTF_8));
          meldung("Java-Datei gespeichert. Starten mit: java " + new JavaExport(projekt).klasse + ".java");
        } catch (Exception e) {
          meldung("Speichern fehlgeschlagen.");
        }
        break;
      case WAHL_IMPORT:
        try (InputStream ein = getContentResolver().openInputStream(uri)) {
          if (ein == null) throw new java.io.IOException();
          Projekt p = Projekt.ausJson(new JSONObject(lies(ein)));
          p.name = freierProjektName(p.name);
          wechsleProjekt(p);
          speichern();
          meldung("„" + p.name + "“ importiert.");
        } catch (Exception e) {
          meldung("Das ist keine Blockwerk-Datei.");
        }
        break;
      default:
        break;
    }
  }

  /** Lädt ein Bild verkleinert, so dass die längere Seite höchstens max Punkte hat. */
  static Bitmap ladeBild(Activity a, Uri uri, int max) {
    try {
      BitmapFactory.Options o = new BitmapFactory.Options();
      o.inJustDecodeBounds = true;
      try (InputStream ein = a.getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(ein, null, o); }
      int teiler = 1;
      while (Math.max(o.outWidth, o.outHeight) / (teiler * 2) >= max) teiler *= 2;
      o = new BitmapFactory.Options();
      o.inSampleSize = teiler;
      Bitmap b;
      try (InputStream ein = a.getContentResolver().openInputStream(uri)) { b = BitmapFactory.decodeStream(ein, null, o); }
      if (b == null) return null;
      float s = Math.min(1f, max / (float) Math.max(b.getWidth(), b.getHeight()));
      int w = Math.max(1, Math.round(b.getWidth() * s)), h = Math.max(1, Math.round(b.getHeight() * s));
      Bitmap fertig = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
      Canvas c = new Canvas(fertig);
      c.scale(w / (float) b.getWidth(), h / (float) b.getHeight());
      c.drawBitmap(b, 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
      return fertig;
    } catch (Exception e) {
      return null;
    }
  }

  private static String lies(InputStream ein) throws java.io.IOException {
    ByteArrayOutputStream aus = new ByteArrayOutputStream();
    byte[] puffer = new byte[16384];
    int n;
    while ((n = ein.read(puffer)) > 0) aus.write(puffer, 0, n);
    return aus.toString("UTF-8");
  }

  // ============================================================== Projekte

  private File ordner() {
    File f = new File(getFilesDir(), "projekte");
    if (!f.exists()) f.mkdirs();
    return f;
  }

  private static String dateiname(String n) {
    String s = n.replaceAll("[^A-Za-z0-9ÄÖÜäöüß _-]", "_").trim();
    return s.isEmpty() ? "Projekt" : s;
  }

  private File datei(String name) { return new File(ordner(), dateiname(name) + ".blockwerk"); }

  private String freierProjektName(String basis) {
    if (!datei(basis).exists()) return basis;
    for (int i = 2; ; i++) if (!datei(basis + " " + i).exists()) return basis + " " + i;
  }

  void speichern() {
    handler.removeCallbacks(spaeterSpeichern);
    try {
      byte[] daten = projekt.json().toString().getBytes(StandardCharsets.UTF_8);
      File ziel = datei(projekt.name);
      File tmp = new File(ziel.getPath() + ".tmp");
      try (FileOutputStream aus = new FileOutputStream(tmp)) { aus.write(daten); }
      if (!tmp.renameTo(ziel)) { ziel.delete(); tmp.renameTo(ziel); }
      einstellungen().edit().putString("zuletzt", projekt.name).apply();
    } catch (Exception e) {
      meldung("Speichern fehlgeschlagen.");
    }
  }

  private SharedPreferences einstellungen() { return getSharedPreferences("blockwerk", MODE_PRIVATE); }

  private Projekt ladeZuletzt() {
    String n = einstellungen().getString("zuletzt", null);
    if (n == null) return null;
    return lade(datei(n));
  }

  private Projekt lade(File f) {
    if (!f.exists()) return null;
    try (FileInputStream ein = new FileInputStream(f)) {
      return Projekt.ausJson(new JSONObject(lies(ein)));
    } catch (Exception e) {
      return null;
    }
  }

  void wechsleProjekt(Projekt p) {
    motor.stoppeAlles();
    projekt = p;
    motor.setzeProjekt(p);
    buehne.projekt = p;
    gross.projekt = p;
    leiste.projekt = p;
    figur = startFigur();
    leiste.auswahl = figur;
    leiste.vorschauenVergessen();
    leiste.invalidate();
    editor.zeige(p, figur);
    if (codeModus) codeAnsicht.zeige(p);
    titelAktualisieren();
    buehne.invalidate();
  }

  private void projektUmbenennen() {
    Auswahl.eingabe(this, "Projekt umbenennen", projekt.name, false, t -> {
      String n = t.trim();
      if (n.isEmpty() || n.equals(projekt.name)) return;
      if (datei(n).exists()) { meldung("Ein Projekt mit diesem Namen gibt es schon."); return; }
      File alt = datei(projekt.name);
      projekt.name = n;
      speichern();
      if (alt.exists() && !alt.equals(datei(n))) alt.delete();
      titelAktualisieren();
    });
  }

  private void zeigeMenue(View anker) {
    PopupMenu m = new PopupMenu(this, anker);
    String[] punkte = {"Neues Projekt", "Projekt öffnen …", "Beispiele …", "Speichern", "Als Java speichern …",
        "Kopie speichern unter …", "Projektdatei exportieren …", "Projektdatei importieren …", "Projekt löschen …",
        "Über Blockwerk"};
    for (int i = 0; i < punkte.length; i++) m.getMenu().add(0, i, i, punkte[i]);
    m.setOnMenuItemClickListener(item -> {
      switch (punkte[item.getItemId()]) {
        case "Neues Projekt":
          speichern();
          Projekt p = Projekt.neu();
          p.name = freierProjektName("Mein Projekt");
          wechsleProjekt(p);
          speichern();
          break;
        case "Projekt öffnen …": projektOeffnen(); break;
        case "Beispiele …": beispiele(); break;
        case "Speichern": speichern(); meldung("Gespeichert."); break;
        case "Als Java speichern …": codeExportieren(); break;
        case "Kopie speichern unter …":
          Auswahl.eingabe(this, "Kopie speichern unter", freierProjektName(projekt.name), false, t -> {
            String n = t.trim();
            if (n.isEmpty()) return;
            if (datei(n).exists()) { meldung("Ein Projekt mit diesem Namen gibt es schon."); return; }
            speichern();
            projekt.name = n;
            speichern();
            titelAktualisieren();
          });
          break;
        case "Projektdatei exportieren …": {
          speichern();
          Intent in = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          in.addCategory(Intent.CATEGORY_OPENABLE);
          in.setType("application/octet-stream");
          in.putExtra(Intent.EXTRA_TITLE, dateiname(projekt.name) + ".blockwerk");
          try { startActivityForResult(in, WAHL_EXPORT); } catch (Exception e) { meldung("Nicht möglich."); }
          break;
        }
        case "Projektdatei importieren …": {
          Intent in = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          in.addCategory(Intent.CATEGORY_OPENABLE);
          in.setType("*/*");
          try { startActivityForResult(in, WAHL_IMPORT); } catch (Exception e) { meldung("Nicht möglich."); }
          break;
        }
        case "Projekt löschen …": projektLoeschen(); break;
        default: ueber(); break;
      }
      return true;
    });
    m.show();
  }

  private File[] projektDateien() {
    File[] fs = ordner().listFiles((dir, name) -> name.endsWith(".blockwerk"));
    if (fs == null) return new File[0];
    Arrays.sort(fs, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
    return fs;
  }

  private static String projektName(File f) {
    String n = f.getName();
    return n.substring(0, n.length() - ".blockwerk".length());
  }

  private void projektOeffnen() {
    speichern();
    File[] fs = projektDateien();
    if (fs.length == 0) { meldung("Noch keine Projekte gespeichert."); return; }
    String[] namen = new String[fs.length];
    for (int i = 0; i < fs.length; i++) namen[i] = projektName(fs[i]);
    Auswahl.liste(this, "Projekt öffnen", namen, i -> {
      Projekt p = lade(fs[i]);
      if (p == null) { meldung("Das Projekt ließ sich nicht laden."); return; }
      p.name = namen[i];
      wechsleProjekt(p);
      einstellungen().edit().putString("zuletzt", p.name).apply();
    });
  }

  private void projektLoeschen() {
    File[] fs = projektDateien();
    if (fs.length == 0) { meldung("Keine Projekte gespeichert."); return; }
    String[] namen = new String[fs.length];
    for (int i = 0; i < fs.length; i++) namen[i] = projektName(fs[i]);
    Auswahl.liste(this, "Projekt löschen", namen, i -> Auswahl.frage(this, "Löschen?",
        "„" + namen[i] + "“ wird endgültig gelöscht.", "Löschen", () -> {
          boolean offen = namen[i].equals(dateiname(projekt.name));
          fs[i].delete();
          if (offen) {
            Projekt p = Projekt.neu();
            p.name = freierProjektName("Mein Projekt");
            wechsleProjekt(p);
            speichern();
          }
          meldung("Gelöscht.");
        }));
  }

  private void beispiele() {
    String[] namen = Beispiele.NAMEN;
    Auswahl.liste(this, "Beispiel öffnen", namen, i -> {
      speichern();
      Projekt p = Beispiele.erzeuge(i);
      p.name = freierProjektName(p.name);
      wechsleProjekt(p);
      speichern();
      meldung("Tippe auf die grüne Flagge!");
    });
  }

  private void ueber() {
    String text = "Blockwerk: Programmieren mit Blöcken, Ergebnis als Java.\n\n"
        + "• Blöcke aus der Palette auf die Fläche ziehen und zusammenstecken.\n"
        + "• ▶ startet alle Skripte mit „Wenn das Programm startet“, ■ hält alles an.\n"
        + "• Einen Stapel antippen startet nur ihn.\n"
        + "• Lange drücken öffnet Menüs: auf Blöcken, auf der Fläche, auf Figuren.\n"
        + "• Blöcke zurück auf die Palette ziehen löscht sie.\n"
        + "• </> zeigt das Projekt als Java-Code.\n"
        + "• „Als Java speichern“ erzeugt eine einzelne .java-Datei mit Bildern und Laufzeit. "
        + "Auf einem Rechner mit JDK (ab Version 11) startet sie mit: java Datei.java\n\n"
        + "Projekte werden automatisch gespeichert.";
    new AlertDialog.Builder(this).setTitle("Über Blockwerk").setMessage(text).setPositiveButton("OK", null).show();
  }

  // ============================================================== Tasten & Sensoren

  private static String taste(int code) {
    if (code >= KeyEvent.KEYCODE_A && code <= KeyEvent.KEYCODE_Z) return String.valueOf((char) ('a' + code - KeyEvent.KEYCODE_A));
    if (code >= KeyEvent.KEYCODE_0 && code <= KeyEvent.KEYCODE_9) return String.valueOf((char) ('0' + code - KeyEvent.KEYCODE_0));
    switch (code) {
      case KeyEvent.KEYCODE_SPACE: return "leertaste";
      case KeyEvent.KEYCODE_DPAD_UP: return "oben";
      case KeyEvent.KEYCODE_DPAD_DOWN: return "unten";
      case KeyEvent.KEYCODE_DPAD_LEFT: return "links";
      case KeyEvent.KEYCODE_DPAD_RIGHT: return "rechts";
      default: return null;
    }
  }

  @Override public boolean dispatchKeyEvent(KeyEvent e) {
    String t = taste(e.getKeyCode());
    if (t != null && !(getCurrentFocus() instanceof EditText)) {
      if (e.getAction() == KeyEvent.ACTION_DOWN) motor.tasteRunter(t);
      else if (e.getAction() == KeyEvent.ACTION_UP) motor.tasteHoch(t);
      return true;
    }
    return super.dispatchKeyEvent(e);
  }

  @SuppressWarnings("deprecation")
  @Override public void onSensorChanged(SensorEvent e) {
    int rot = getWindowManager().getDefaultDisplay().getRotation();
    float ax = e.values[0], ay = e.values[1], x, y;
    switch (rot) {
      case Surface.ROTATION_90: x = -ay; y = ax; break;
      case Surface.ROTATION_180: x = -ax; y = -ay; break;
      case Surface.ROTATION_270: x = ay; y = -ax; break;
      default: x = ax; y = ay; break;
    }
    glattX = glattX * 0.8f + x * 0.2f;
    glattY = glattY * 0.8f + y * 0.2f;
    motor.neigungLR = Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, -glattX / 9.81))));
    motor.neigungVZ = Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, glattY / 9.81))));
  }

  @Override public void onAccuracyChanged(Sensor s, int a) {}
}
