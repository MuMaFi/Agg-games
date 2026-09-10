package de.agg.spiele;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hülle um die Spiele. Sie liegen als Beiwerk in der Anwendung und werden
 * unter einer eigenen Herkunft ausgeliefert statt über file:// — anders
 * verweigert der WebView ES-Module und die Importkarte, und genau die
 * brauchen die 3D-Spiele.
 */
public class MainActivity extends Activity {

  private static final String HERKUNFT = "https://spiele.agg.local/";
  private static final String START = HERKUNFT + "index.html";

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
    TYPEN.put("glb",  "model/gltf-binary");
    TYPEN.put("gltf", "model/gltf+json");
    TYPEN.put("bin",  "application/octet-stream");
    TYPEN.put("mp3",  "audio/mpeg");
    TYPEN.put("ogg",  "audio/ogg");
    TYPEN.put("wav",  "audio/wav");
    TYPEN.put("txt",  "text/plain");
  }

  private WebView netz;

  @SuppressLint("SetJavaScriptEnabled")
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
    netz.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    netz.setBackgroundColor(0xFF000000);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(false);
    }

    netz.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest a) {
        return ausBeiwerk(a.getUrl().toString());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest a) {
        // Alles außerhalb der Anwendung bleibt draußen.
        return !a.getUrl().toString().startsWith(HERKUNFT);
      }
    });

    setContentView(netz);
    netz.loadUrl(START);
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

  /** Zurück führt im Spiel eine Seite zurück, nicht gleich aus der App. */
  @Override public boolean onKeyDown(int taste, KeyEvent e) {
    if (taste == KeyEvent.KEYCODE_BACK && netz != null && netz.canGoBack()) {
      netz.goBack();
      return true;
    }
    return super.onKeyDown(taste, e);
  }

  @Override protected void onPause()  { super.onPause();  if (netz != null) netz.onPause();  }
  @Override protected void onResume() { super.onResume(); if (netz != null) netz.onResume(); vollbild(); }
  @Override protected void onDestroy(){ if (netz != null) netz.destroy(); super.onDestroy(); }
}
