package de.mumafi.burnline;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.HashMap;
import java.util.Map;

/**
 * Burnline als Android-App: ein WebView, der burnline.html aus assets/ unter
 * einer eigenen Herkunft ausliefert. Dazu kommen drei Dinge, die der WebView
 * allein nicht kann:
 *  - mehrere Songs auf einmal auswählen,
 *  - das Mikrofon freigeben,
 *  - exportierte Videos stückweise auf die Platte schreiben und am Ende in
 *    Filme/Burnline ablegen (Android 10+, ohne Speicher-Berechtigung).
 */
public class MainActivity extends Activity {

  private static final String HERKUNFT = "https://burnline.app.local/";
  private static final int DATEI_WAEHLEN = 1;
  private static final int MIKRO_ERLAUBNIS = 2;

  private static final Map<String, String> TYPEN = new HashMap<>();
  static {
    TYPEN.put("html", "text/html");
    TYPEN.put("js", "text/javascript");
    TYPEN.put("css", "text/css");
    TYPEN.put("json", "application/json");
    TYPEN.put("png", "image/png");
    TYPEN.put("woff2", "font/woff2");
    TYPEN.put("txt", "text/plain");
  }

  private WebView netz;
  private ValueCallback<Uri[]> dateiRueckruf;
  private PermissionRequest offeneMikroAnfrage;

  // laufende Video-Aufnahme
  private File aufnahme;
  private RandomAccessFile aufnahmeDatei;
  private long anhangPos;

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
    e.setAllowContentAccess(true);
    e.setTextZoom(100);
    e.setUserAgentString(e.getUserAgentString() + " BurnlineAndroid");
    netz.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    netz.setBackgroundColor(0xFF070303);
    WebView.setWebContentsDebuggingEnabled(false);
    netz.addJavascriptInterface(new Bruecke(), "BurnlineAndroid");

    netz.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest a) {
        return ausBeiwerk(a.getUrl().toString());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest a) {
        String url = a.getUrl().toString();
        if (url.startsWith(HERKUNFT)) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, a.getUrl())); } catch (ActivityNotFoundException ignored) {}
        return true;
      }
    });

    netz.setWebChromeClient(new WebChromeClient() {
      // <input type="file" multiple> — Songs aus Dateien, Downloads, Drive …
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> rueckruf, FileChooserParams wahl) {
        if (dateiRueckruf != null) dateiRueckruf.onReceiveValue(null);
        dateiRueckruf = rueckruf;
        Intent absicht = new Intent(Intent.ACTION_GET_CONTENT);
        absicht.addCategory(Intent.CATEGORY_OPENABLE);
        absicht.setType("audio/*");
        absicht.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/*"});
        absicht.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, wahl.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
        try {
          startActivityForResult(Intent.createChooser(absicht, "Songs auswählen"), DATEI_WAEHLEN);
        } catch (ActivityNotFoundException keine) {
          dateiRueckruf = null;
          return false;
        }
        return true;
      }

      // getUserMedia({audio}) — erst Android fragen, dann dem WebView erlauben
      @Override public void onPermissionRequest(PermissionRequest anfrage) {
        runOnUiThread(() -> {
          boolean nurTon = true;
          for (String r : anfrage.getResources())
            if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) nurTon = false;
          if (!nurTon) { anfrage.deny(); return; }
          if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            anfrage.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
          } else {
            offeneMikroAnfrage = anfrage;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIKRO_ERLAUBNIS);
          }
        });
      }
    });

    setContentView(netz);
    netz.loadUrl(HERKUNFT + "index.html");
  }

  @Override public void onRequestPermissionsResult(int anfrage, String[] rechte, int[] ergebnisse) {
    super.onRequestPermissionsResult(anfrage, rechte, ergebnisse);
    if (anfrage != MIKRO_ERLAUBNIS || offeneMikroAnfrage == null) return;
    boolean ja = ergebnisse.length > 0 && ergebnisse[0] == PackageManager.PERMISSION_GRANTED;
    if (ja) offeneMikroAnfrage.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
    else offeneMikroAnfrage.deny();
    offeneMikroAnfrage = null;
  }

  @Override protected void onActivityResult(int anfrage, int ergebnis, Intent daten) {
    super.onActivityResult(anfrage, ergebnis, daten);
    if (anfrage != DATEI_WAEHLEN) return;
    Uri[] orte = null;
    if (ergebnis == RESULT_OK && daten != null) {
      ClipData clip = daten.getClipData();
      if (clip != null && clip.getItemCount() > 0) {
        orte = new Uri[clip.getItemCount()];
        for (int i = 0; i < clip.getItemCount(); i++) orte[i] = clip.getItemAt(i).getUri();
      } else if (daten.getData() != null) {
        orte = new Uri[]{ daten.getData() };
      }
    }
    if (dateiRueckruf != null) dateiRueckruf.onReceiveValue(orte);
    dateiRueckruf = null;
  }

  /** Was die Seite von der App will: das fertige Video sichern. */
  private class Bruecke {
    @JavascriptInterface public synchronized boolean recBegin(String endung) {
      schliessen();
      try {
        aufnahme = new File(getCacheDir(), "burnline-export." + ("mp4".equals(endung) ? "mp4" : "webm"));
        aufnahmeDatei = new RandomAccessFile(aufnahme, "rw");
        aufnahmeDatei.setLength(0);
        anhangPos = 0;
        return true;
      } catch (IOException f) {
        return false;
      }
    }

    /** Ein Stück schreiben; position -1 heißt: hinten anhängen. */
    @JavascriptInterface public synchronized String recChunk(String base64, double position) {
      if (aufnahmeDatei == null) return "no recording in progress";
      try {
        byte[] b = Base64.decode(base64, Base64.DEFAULT);
        long pos = position < 0 ? anhangPos : (long) position;
        aufnahmeDatei.seek(pos);
        aufnahmeDatei.write(b);
        anhangPos = Math.max(anhangPos, pos + b.length);
        return "ok";
      } catch (IOException | IllegalArgumentException f) {
        return "write failed: " + f.getMessage();
      }
    }

    /** Fertig: in Filme/Burnline ablegen, damit es in der Galerie auftaucht. */
    @JavascriptInterface public synchronized String recEnd(String name) {
      JSONObject antwort = new JSONObject();
      try {
        if (aufnahmeDatei == null) throw new IOException("no recording in progress");
        aufnahmeDatei.close();
        aufnahmeDatei = null;
        String typ = aufnahme.getName().endsWith(".mp4") ? "video/mp4" : "video/webm";
        ContentResolver cr = getContentResolver();
        ContentValues werte = new ContentValues();
        werte.put(MediaStore.Video.Media.DISPLAY_NAME, name.replaceAll("[\\\\/:*?\"<>|]", " "));
        werte.put(MediaStore.Video.Media.MIME_TYPE, typ);
        werte.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Burnline");
        werte.put(MediaStore.Video.Media.IS_PENDING, 1);
        Uri ziel = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, werte);
        if (ziel == null) throw new IOException("could not create the video in Movies");
        try (InputStream ein = new FileInputStream(aufnahme); OutputStream aus = cr.openOutputStream(ziel)) {
          if (aus == null) throw new IOException("could not open the video for writing");
          byte[] puffer = new byte[1 << 20];
          int n;
          while ((n = ein.read(puffer)) > 0) aus.write(puffer, 0, n);
        }
        werte.clear();
        werte.put(MediaStore.Video.Media.IS_PENDING, 0);
        cr.update(ziel, werte, null, null);
        //noinspection ResultOfMethodCallIgnored
        aufnahme.delete();
        antwort.put("ok", true);
        antwort.put("path", "Movies/Burnline/" + name);
        runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Movies/Burnline", Toast.LENGTH_LONG).show());
      } catch (Exception f) {
        try { antwort.put("ok", false); antwort.put("error", f.getMessage()); } catch (Exception ignored) {}
      }
      return antwort.toString();
    }

    @JavascriptInterface public synchronized boolean recAbort() {
      schliessen();
      return true;
    }
  }

  private void schliessen() {
    if (aufnahmeDatei != null) { try { aufnahmeDatei.close(); } catch (IOException ignored) {} aufnahmeDatei = null; }
    if (aufnahme != null) { //noinspection ResultOfMethodCallIgnored
      aufnahme.delete(); aufnahme = null; }
  }

  /** Liefert eine Datei aus assets/ unter der eigenen Herkunft aus. */
  private WebResourceResponse ausBeiwerk(String url) {
    if (!url.startsWith(HERKUNFT)) return null;
    String pfad = url.substring(HERKUNFT.length());
    int frage = pfad.indexOf('?'); if (frage >= 0) pfad = pfad.substring(0, frage);
    int raute = pfad.indexOf('#'); if (raute >= 0) pfad = pfad.substring(0, raute);
    if (pfad.isEmpty() || pfad.endsWith("/")) pfad += "index.html";
    if (pfad.contains("..")) return null;
    try {
      InputStream strom = getAssets().open(pfad);
      int punkt = pfad.lastIndexOf('.');
      String typ = TYPEN.get(punkt < 0 ? "" : pfad.substring(punkt + 1).toLowerCase());
      if (typ == null) typ = "application/octet-stream";
      WebResourceResponse antwort = new WebResourceResponse(typ,
          typ.startsWith("text/") || typ.contains("json") ? "utf-8" : null, strom);
      Map<String, String> kopf = new HashMap<>();
      kopf.put("Cache-Control", "no-cache");
      antwort.setResponseHeaders(kopf);
      return antwort;
    } catch (IOException nichtDa) {
      return null;
    }
  }

  private void vollbild() {
    getWindow().getDecorView().setSystemUiVisibility(
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

  /** Zurück schließt erst offene Menüs in der Seite, dann geht die App in den Hintergrund. */
  @Override public boolean onKeyDown(int taste, KeyEvent e) {
    if (taste == KeyEvent.KEYCODE_BACK && netz != null) {
      netz.evaluateJavascript(
          "(function(){try{return !!(window.androidZurueck&&window.androidZurueck());}catch(f){return false;}})()",
          erledigt -> { if (!"true".equals(erledigt)) moveTaskToBack(true); });
      return true;
    }
    return super.onKeyDown(taste, e);
  }

  @Override protected void onResume() { super.onResume(); if (netz != null) netz.onResume(); vollbild(); }
  @Override protected void onDestroy() { schliessen(); if (netz != null) netz.destroy(); super.onDestroy(); }
}
