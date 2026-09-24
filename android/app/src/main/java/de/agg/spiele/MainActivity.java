package de.agg.spiele;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Hülle um die Spiele. Sie liegen als Beiwerk in der Anwendung und werden
 * unter einer eigenen Herkunft ausgeliefert statt über file:// — anders
 * verweigert der WebView ES-Module und die Importkarte, und genau die
 * brauchen die 3D-Spiele.
 *
 * Welche Seite zuerst kommt, legt die Variante fest (BuildConfig.START):
 * „alle“ startet in der Übersicht, „pocketcraft“ gleich im Spiel.
 */
public class MainActivity extends Activity {

  private static final String HERKUNFT = "https://spiele.agg.local/";
  private static final String START = HERKUNFT + BuildConfig.START;

  private static final int DATEI_WAEHLEN = 1;
  private static final int DATEI_SICHERN = 2;

  private static final Map<String, String> TYPEN = new HashMap<>();
  static {
    TYPEN.put("html", "text/html");
    TYPEN.put("js",   "text/javascript");
    TYPEN.put("mjs",  "text/javascript");
    TYPEN.put("css",  "text/css");
    TYPEN.put("json", "application/json");
    TYPEN.put("webmanifest", "application/manifest+json");
    TYPEN.put("png",  "image/png");
    TYPEN.put("jpg",  "image/jpeg");
    TYPEN.put("jpeg", "image/jpeg");
    TYPEN.put("gif",  "image/gif");
    TYPEN.put("svg",  "image/svg+xml");
    TYPEN.put("ico",  "image/x-icon");
    TYPEN.put("webp", "image/webp");
    TYPEN.put("woff2","font/woff2");
    TYPEN.put("woff", "font/woff");
    TYPEN.put("ttf",  "font/ttf");
    TYPEN.put("otf",  "font/otf");
    TYPEN.put("glb",  "model/gltf-binary");
    TYPEN.put("gltf", "model/gltf+json");
    TYPEN.put("bin",  "application/octet-stream");
    TYPEN.put("mp3",  "audio/mpeg");
    TYPEN.put("ogg",  "audio/ogg");
    TYPEN.put("wav",  "audio/wav");
    TYPEN.put("txt",  "text/plain");
  }

  private WebView netz;
  /** wartet auf die Datei, die jemand zum Einlesen aussucht */
  private ValueCallback<Uri[]> dateiRueckruf;
  /** wartet darauf, dass jemand einen Ort zum Sichern aussucht */
  private String zuSichern;

  @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
  @Override protected void onCreate(Bundle zustand) {
    super.onCreate(zustand);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    vollbild();

    netz = new WebView(this);
    WebSettings e = netz.getSettings();
    e.setJavaScriptEnabled(true);
    e.setDomStorageEnabled(true);
    e.setMediaPlaybackRequiresUserGesture(false);
    e.setAllowFileAccess(false);
    e.setAllowContentAccess(false);
    e.setCacheMode(WebSettings.LOAD_DEFAULT);
    e.setTextZoom(100);
    // Die Seiten erkennen daran, dass sie in der App laufen — und ob es
    // die App mit nur einem Spiel ist (dann ohne Knopf zur Übersicht).
    e.setUserAgentString(e.getUserAgentString()
        + (BuildConfig.EINZELN ? " AGGApp/einzeln" : " AGGApp/alle"));
    netz.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    netz.setBackgroundColor(0xFF000000);
    WebView.setWebContentsDebuggingEnabled(false);
    netz.addJavascriptInterface(new Bruecke(), "AGGApp");

    netz.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest a) {
        return ausBeiwerk(a.getUrl().toString());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest a) {
        // Alles außerhalb der Anwendung bleibt draußen.
        return !a.getUrl().toString().startsWith(HERKUNFT);
      }
    });

    // <input type="file"> — ohne das passiert im WebView beim Antippen nichts
    netz.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> rueckruf,
                                                 FileChooserParams wahl) {
        if (dateiRueckruf != null) dateiRueckruf.onReceiveValue(null);
        dateiRueckruf = rueckruf;
        Intent absicht = new Intent(Intent.ACTION_GET_CONTENT);
        absicht.addCategory(Intent.CATEGORY_OPENABLE);
        absicht.setType("*/*");
        try {
          startActivityForResult(absicht, DATEI_WAEHLEN);
        } catch (ActivityNotFoundException keine) {
          dateiRueckruf = null;
          return false;
        }
        return true;
      }
    });

    setContentView(netz);
    netz.loadUrl(START);
  }

  /** Was die Seiten von der App wollen dürfen — nur das hier. */
  private class Bruecke {
    /** Sicherungsdatei ablegen: die App fragt, wohin (kein Recht nötig). */
    @JavascriptInterface public void dateiSichern(String name, String inhalt) {
      runOnUiThread(() -> {
        zuSichern = inhalt;
        Intent absicht = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        absicht.addCategory(Intent.CATEGORY_OPENABLE);
        absicht.setType("application/json");
        absicht.putExtra(Intent.EXTRA_TITLE, name);
        try {
          startActivityForResult(absicht, DATEI_SICHERN);
        } catch (ActivityNotFoundException keine) {
          zuSichern = null;
          Toast.makeText(MainActivity.this, "Hier gibt es keinen Ort zum Sichern.", Toast.LENGTH_LONG).show();
        }
      });
    }
  }

  @Override protected void onActivityResult(int anfrage, int ergebnis, Intent daten) {
    super.onActivityResult(anfrage, ergebnis, daten);
    Uri ort = (ergebnis == RESULT_OK && daten != null) ? daten.getData() : null;
    if (anfrage == DATEI_WAEHLEN) {
      if (dateiRueckruf != null) dateiRueckruf.onReceiveValue(ort == null ? null : new Uri[]{ ort });
      dateiRueckruf = null;
    } else if (anfrage == DATEI_SICHERN) {
      String inhalt = zuSichern;
      zuSichern = null;
      if (ort == null || inhalt == null) return;
      try (OutputStream aus = getContentResolver().openOutputStream(ort)) {
        if (aus == null) throw new IOException("kein Strom");
        aus.write(inhalt.getBytes(StandardCharsets.UTF_8));
        Toast.makeText(this, "Welt gesichert.", Toast.LENGTH_SHORT).show();
      } catch (IOException f) {
        Toast.makeText(this, "Sichern ging nicht: " + f.getMessage(), Toast.LENGTH_LONG).show();
      }
    }
  }

  /** Liefert eine Datei aus assets/ unter der eigenen Herkunft aus. */
  private WebResourceResponse ausBeiwerk(String url) {
    if (!url.startsWith(HERKUNFT)) return null;
    String pfad = url.substring(HERKUNFT.length());
    int frage = pfad.indexOf('?');
    if (frage >= 0) pfad = pfad.substring(0, frage);
    int raute = pfad.indexOf('#');
    if (raute >= 0) pfad = pfad.substring(0, raute);
    if (pfad.isEmpty() || pfad.endsWith("/")) pfad += "index.html";
    if (pfad.contains("..")) return null;          // nichts außerhalb von assets/

    try {
      InputStream strom = getAssets().open(pfad);
      String typ = TYPEN.get(endung(pfad));
      if (typ == null) typ = "application/octet-stream";
      Map<String, String> kopf = new HashMap<>();
      kopf.put("Access-Control-Allow-Origin", "*");
      kopf.put("Cache-Control", "no-cache");
      WebResourceResponse antwort = new WebResourceResponse(
          typ, typ.startsWith("text/") || typ.contains("json") ? "utf-8" : null, strom);
      antwort.setResponseHeaders(kopf);
      return antwort;
    } catch (IOException nichtDa) {
      return null;
    }
  }

  private static String endung(String pfad) {
    int punkt = pfad.lastIndexOf('.');
    return punkt < 0 ? "" : pfad.substring(punkt + 1).toLowerCase();
  }

  private void vollbild() {
    View w = getWindow().getDecorView();
    w.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
  }

  @Override public void onWindowFocusChanged(boolean hat) {
    super.onWindowFocusChanged(hat);
    if (hat) vollbild();
  }

  /** Zurück fragt erst das Spiel (Pocketcraft öffnet dann die Pause, statt
      dass die App zugeht), dann den Verlauf; erst danach geht die App in
      den Hintergrund. */
  @Override public boolean onKeyDown(int taste, KeyEvent e) {
    if (taste == KeyEvent.KEYCODE_BACK && netz != null) {
      netz.evaluateJavascript(
          "(function(){try{return !!(window.androidZurueck&&window.androidZurueck());}catch(f){return false;}})()",
          erledigt -> {
            if ("true".equals(erledigt)) return;
            if (netz.canGoBack()) netz.goBack();
            else moveTaskToBack(true);
          });
      return true;
    }
    return super.onKeyDown(taste, e);
  }

  @Override protected void onPause() {
    super.onPause();
    if (netz != null) {
      // Das Spiel hält an und sichert, bevor die App aus dem Blick gerät
      netz.evaluateJavascript("window.androidPause&&window.androidPause()", null);
      netz.onPause();
    }
  }
  @Override protected void onResume() { super.onResume(); if (netz != null) netz.onResume(); vollbild(); }
  @Override protected void onDestroy(){ if (netz != null) netz.destroy(); super.onDestroy(); }
}
