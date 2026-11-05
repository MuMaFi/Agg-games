package de.mumafi.blockwerk;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Random;

/** Klänge und Noten, alle synthetisch erzeugt, und ein kleines Mischpult, das
 *  beliebig viele davon gleichzeitig über eine einzige AudioTrack abspielt. */
final class Klang implements Runnable {

  static final int RATE = 22050;

  static final String[][] KLAENGE = {
      {"piep", "Piep"}, {"plopp", "Klick"}, {"muenze", "Signal"}, {"sprung", "Aufwärts"},
      {"tropfen", "Tropfen"}, {"glocke", "Glocke"}, {"trommel", "Trommel"}, {"becken", "Becken"},
      {"klatschen", "Klatschen"}, {"laser", "Abwärts"},
  };

  static final String[][] INSTRUMENTE = {
      {"klavier", "Klavier"}, {"orgel", "Orgel"}, {"gitarre", "Gitarre"}, {"floete", "Flöte"},
      {"bass", "Bass"}, {"synth", "Synthesizer"}, {"glocken", "Glockenspiel"},
  };

  private static final class Stimme {
    final float[] daten;
    final float vol;
    int pos;
    Stimme(float[] daten, float vol) { this.daten = daten; this.vol = vol; }
  }

  private final ArrayList<Stimme> stimmen = new ArrayList<>();
  private final HashMap<String, float[]> vorrat = new HashMap<>();
  private Thread faden;
  private volatile boolean an;

  synchronized void start() {
    if (an) return;
    an = true;
    faden = new Thread(this, "Klang");
    faden.setPriority(Thread.MAX_PRIORITY);
    faden.start();
  }

  synchronized void stopp() {
    an = false;
    if (faden != null) {
      try { faden.join(300); } catch (InterruptedException ignored) {}
      faden = null;
    }
    stoppeAlle();
  }

  void stoppeAlle() {
    synchronized (stimmen) { stimmen.clear(); }
  }

  /** Spielt einen Klang und gibt seine Dauer in Sekunden zurück. */
  double spiele(String id, double lautstaerke) {
    float[] d = klang(id);
    if (d == null) return 0;
    abspielen(d, lautstaerke);
    return d.length / (double) RATE;
  }

  double note(String instrument, double note, double sekunden, double lautstaerke) {
    sekunden = Math.max(0.02, Math.min(8, sekunden));
    note = Math.max(0, Math.min(130, note));
    String schluessel = instrument + "|" + Math.round(note * 10) + "|" + Math.round(sekunden * 100);
    float[] d;
    synchronized (vorrat) { d = vorrat.get(schluessel); }
    if (d == null) {
      d = erzeugeNote(instrument, 440 * Math.pow(2, (note - 69) / 12.0), sekunden);
      synchronized (vorrat) { if (vorrat.size() > 200) vorrat.clear(); vorrat.put(schluessel, d); }
    }
    abspielen(d, lautstaerke);
    return sekunden;
  }

  private void abspielen(float[] d, double lautstaerke) {
    float v = (float) Math.max(0, Math.min(1, lautstaerke / 100.0));
    if (v <= 0) return;
    synchronized (stimmen) {
      if (stimmen.size() > 24) stimmen.remove(0);
      stimmen.add(new Stimme(d, v));
    }
  }

  @Override public void run() {
    int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
    AudioTrack spur;
    try {
      spur = new AudioTrack.Builder()
          .setAudioAttributes(new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_GAME)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build())
          .setAudioFormat(new AudioFormat.Builder()
              .setSampleRate(RATE)
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build())
          .setBufferSizeInBytes(Math.max(min, 4096))
          .setTransferMode(AudioTrack.MODE_STREAM)
          .build();
      spur.play();
    } catch (Exception e) {
      an = false;
      return;
    }
    short[] aus = new short[512];
    float[] mix = new float[512];
    while (an) {
      boolean aktiv;
      synchronized (stimmen) {
        aktiv = !stimmen.isEmpty();
        if (aktiv) {
          java.util.Arrays.fill(mix, 0);
          Iterator<Stimme> it = stimmen.iterator();
          while (it.hasNext()) {
            Stimme s = it.next();
            int n = Math.min(mix.length, s.daten.length - s.pos);
            for (int i = 0; i < n; i++) mix[i] += s.daten[s.pos + i] * s.vol;
            s.pos += n;
            if (s.pos >= s.daten.length) it.remove();
          }
        }
      }
      if (!aktiv) {
        try { Thread.sleep(8); } catch (InterruptedException e) { break; }
        continue;
      }
      for (int i = 0; i < aus.length; i++) {
        float m = mix[i] * 0.8f;
        if (m > 1) m = 1; else if (m < -1) m = -1;
        aus[i] = (short) (m * 32000);
      }
      spur.write(aus, 0, aus.length);
    }
    try { spur.stop(); } catch (Exception ignored) {}
    spur.release();
  }

  // ------------------------------------------------------------- Klänge

  private float[] klang(String id) {
    synchronized (vorrat) {
      float[] d = vorrat.get("k|" + id);
      if (d != null) return d;
    }
    float[] d = erzeugeKlang(id);
    if (d != null) synchronized (vorrat) { vorrat.put("k|" + id, d); }
    return d;
  }

  private static float[] puffer(double sek) { return new float[(int) (sek * RATE)]; }

  private static float[] erzeugeKlang(String id) {
    Random z = new Random(3);
    float[] d;
    double ph = 0;
    switch (id) {
      case "plopp":
        d = puffer(0.16);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (250 + 650 * Math.exp(-t * 40)) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 22) * Math.min(1, t * 800));
        }
        return d;
      case "piep":
        d = puffer(0.18);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * 1046 / RATE;
          d[i] = (float) ((Math.sin(ph) + 0.25 * Math.sin(3 * ph)) * 0.6 * huelle(t, 0.18, 0.004, 0.04));
        }
        return d;
      case "boing":
        d = puffer(0.7);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          double f = 160 + 260 * t + 70 * Math.sin(2 * Math.PI * 9 * t) * Math.exp(-t * 2);
          ph += 2 * Math.PI * f / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 4) * Math.min(1, t * 300));
        }
        return d;
      case "sprung":
        d = puffer(0.28);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (280 + 900 * t / 0.28) / RATE;
          d[i] = (float) (Math.signum(Math.sin(ph)) * 0.3 * huelle(t, 0.28, 0.005, 0.08));
        }
        return d;
      case "muenze":
        d = puffer(0.42);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          double f = t < 0.08 ? 988 : 1319;
          ph += 2 * Math.PI * f / RATE;
          double e = t < 0.08 ? 1 : Math.exp(-(t - 0.08) * 9);
          d[i] = (float) ((Math.sin(ph) > 0 ? 0.28 : -0.28) * e * Math.min(1, t * 1000));
        }
        return d;
      case "trommel":
        d = puffer(0.4);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (52 + 110 * Math.exp(-t * 25)) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 9) + (z.nextFloat() * 2 - 1) * 0.35 * Math.exp(-t * 45));
        }
        return d;
      case "becken": {
        d = puffer(1.0);
        float alt = 0;
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          float n = z.nextFloat() * 2 - 1;
          d[i] = (float) ((n - alt) * 0.45 * Math.exp(-t * 4) * Math.min(1, t * 2000));
          alt = n;
        }
        return d;
      }
      case "klatschen":
        d = puffer(0.25);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          double e = 0;
          for (double s : new double[]{0, 0.011, 0.022}) if (t >= s) e += Math.exp(-(t - s) * 70);
          e += 0.25 * Math.exp(-t * 14);
          d[i] = (float) ((z.nextFloat() * 2 - 1) * 0.45 * Math.min(1.2, e));
        }
        return d;
      case "glocke":
        d = puffer(1.6);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          double w = 2 * Math.PI * 784 * t;
          d[i] = (float) ((Math.sin(w) * Math.exp(-t * 2.2) + 0.5 * Math.sin(w * 2.76) * Math.exp(-t * 3.5)
              + 0.25 * Math.sin(w * 5.4) * Math.exp(-t * 6)) * 0.55 * Math.min(1, t * 1500));
        }
        return d;
      case "laser":
        d = puffer(0.35);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (200 + 1700 * Math.exp(-t * 9)) / RATE;
          d[i] = (float) (Math.signum(Math.sin(ph)) * 0.28 * huelle(t, 0.35, 0.003, 0.1));
        }
        return d;
      case "hupe": {
        d = puffer(0.55);
        double ph2 = 0;
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * 349 / RATE;
          ph2 += 2 * Math.PI * 440 / RATE;
          double s = Math.signum(Math.sin(ph)) + Math.signum(Math.sin(ph2));
          d[i] = (float) (s * 0.16 * huelle(t, 0.55, 0.01, 0.06));
        }
        return d;
      }
      case "tropfen":
        d = puffer(0.2);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (500 + 1300 * (1 - Math.exp(-t * 30))) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 20) * Math.min(1, t * 1500));
        }
        return d;
      case "zwitschern":
        d = puffer(0.5);
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          double tt = t % 0.16;
          ph += 2 * Math.PI * (2400 + 1500 * tt / 0.16) / RATE;
          d[i] = (float) (Math.sin(ph) * 0.5 * (tt < 0.12 ? Math.sin(Math.PI * tt / 0.12) : 0));
        }
        return d;
      default:
        return null;
    }
  }

  /** Einschwingen, Halten, Ausklingen */
  private static double huelle(double t, double dauer, double an, double ab) {
    if (t < an) return t / an;
    if (t > dauer - ab) return Math.max(0, (dauer - t) / ab);
    return 1;
  }

  private static float[] erzeugeNote(String instrument, double f, double sek) {
    float[] d = puffer(sek);
    double aus = Math.min(0.04, sek / 4);
    switch (instrument) {
      case "gitarre": {
        // Karplus-Strong: gezupfte Saite
        int n = Math.max(2, (int) Math.round(RATE / f));
        float[] ring = new float[n];
        Random z = new Random(11);
        for (int i = 0; i < n; i++) ring[i] = z.nextFloat() * 2 - 1;
        int p = 0;
        for (int i = 0; i < d.length; i++) {
          float v = ring[p];
          int q = (p + 1) % n;
          ring[p] = 0.497f * (v + ring[q]);
          p = q;
          double t = i / (double) RATE;
          d[i] = (float) (v * 0.7 * (t > sek - aus ? (sek - t) / aus : 1));
        }
        return d;
      }
      default:
        break;
    }
    double ph = 0;
    for (int i = 0; i < d.length; i++) {
      double t = i / (double) RATE;
      double rel = t > sek - aus ? Math.max(0, (sek - t) / aus) : 1;
      double s;
      switch (instrument) {
        case "orgel":
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) + 0.6 * Math.sin(2 * ph) + 0.35 * Math.sin(3 * ph) + 0.2 * Math.sin(4 * ph)) * 0.38
              * Math.min(1, t * 80);
          break;
        case "floete": {
          double vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
          ph += 2 * Math.PI * f * vib / RATE;
          s = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * 0.7 * Math.min(1, t * 18);
          break;
        }
        case "bass": {
          ph += 2 * Math.PI * f / RATE;
          double x = (ph / (2 * Math.PI)) % 1.0;
          s = (4 * Math.abs(x - 0.5) - 1) * 0.9 * Math.exp(-t * 1.8) * Math.min(1, t * 400);
          break;
        }
        case "synth":
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) > 0 ? 0.3 : -0.3) * Math.exp(-t * 1.2) * Math.min(1, t * 400);
          break;
        case "glocken": {
          double w = 2 * Math.PI * f * t;
          s = (Math.sin(w) * Math.exp(-t * 3) + 0.4 * Math.sin(w * 3.98) * Math.exp(-t * 7)) * 0.6
              * Math.min(1, t * 1500);
          break;
        }
        case "klavier":
        default:
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph) + 0.1 * Math.sin(4 * ph)) * 0.5
              * Math.exp(-t * 2.6) * Math.min(1, t * 600);
          break;
      }
      d[i] = (float) (s * rel);
    }
    return d;
  }
}
