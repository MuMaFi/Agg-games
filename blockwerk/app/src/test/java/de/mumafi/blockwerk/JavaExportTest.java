package de.mumafi.blockwerk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Exportiert alle Beispiele als Java, übersetzt sie mit javac und lässt sie
 *  ohne Fenster laufen. Die Dateien landen unter build/java. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class JavaExportTest {

  static String laufzeit() throws Exception {
    return new String(Files.readAllBytes(new File("src/main/assets/laufzeit.java").toPath()), StandardCharsets.UTF_8);
  }

  static String werkzeug(String name) {
    return new File(System.getProperty("java.home"), "bin/" + name).getPath();
  }

  /** Startet ein Programm und gibt Ausgabe und Rückgabewert zurück. */
  static String[] fuehreAus(File ordner, String eingabe, String... befehl) throws Exception {
    ProcessBuilder pb = new ProcessBuilder(befehl).directory(ordner).redirectErrorStream(true);
    Process p = pb.start();
    if (eingabe != null) p.getOutputStream().write(eingabe.getBytes(StandardCharsets.UTF_8));
    p.getOutputStream().close();
    ByteArrayOutputStream aus = new ByteArrayOutputStream();
    try (InputStream in = p.getInputStream()) {
      byte[] puffer = new byte[8192];
      int n;
      while ((n = in.read(puffer)) > 0) aus.write(puffer, 0, n);
    }
    assertTrue("läuft zu lange", p.waitFor(120, TimeUnit.SECONDS));
    return new String[]{aus.toString("UTF-8"), String.valueOf(p.exitValue())};
  }

  static File exportiere(Projekt p, String verzeichnis) throws Exception {
    JavaExport x = new JavaExport(p);
    File ordner = new File("build/java/" + verzeichnis);
    ordner.mkdirs();
    File datei = new File(ordner, x.klasse + ".java");
    Files.write(datei.toPath(), x.datei(laufzeit()).getBytes(StandardCharsets.UTF_8));
    Files.write(new File(ordner, x.klasse + "-programm.txt").toPath(), x.programm().getBytes(StandardCharsets.UTF_8));
    return datei;
  }

  @Test public void beispieleUebersetzenUndLaufen() throws Exception {
    List<String> fehler = new ArrayList<>();
    for (int i = 0; i < Beispiele.NAMEN.length; i++) {
      File datei = exportiere(Beispiele.erzeuge(i), "beispiel" + i);
      File ordner = datei.getParentFile();
      String klasse = datei.getName().replace(".java", "");
      String[] javac = fuehreAus(ordner, null, werkzeug("javac"), "-encoding", "UTF-8", "-Xlint:none", "-d", "klassen", datei.getName());
      if (!javac[1].equals("0")) {
        fehler.add(Beispiele.NAMEN[i] + ":\n" + javac[0]);
        continue;
      }
      String[] lauf = fuehreAus(ordner, "50\n25\n75\n12\n", werkzeug("java"), "-Djava.awt.headless=true",
          "-Dblockwerk.kopflos=2.5", "-Dblockwerk.bild=../../bilder/java-" + i + ".png", "-cp", "klassen", klasse);
      Files.write(new File(ordner, "ausgabe.txt").toPath(), lauf[0].getBytes(StandardCharsets.UTF_8));
      if (!lauf[1].equals("0") || !lauf[0].contains("== Stand nach dem Lauf") || lauf[0].contains("Exception")) {
        fehler.add(Beispiele.NAMEN[i] + " (Lauf):\n" + lauf[0]);
      }
    }
    assertEquals(String.join("\n\n", fehler), 0, fehler.size());
  }

  /** So startet es ein Mensch: ohne javac, direkt aus der Quelldatei. */
  @Test public void startetDirektAusDerQuelldatei() throws Exception {
    File datei = exportiere(Beispiele.erzeuge(2), "direkt");
    String[] lauf = fuehreAus(datei.getParentFile(), "50\n", werkzeug("java"), "-Djava.awt.headless=true",
        "-Dblockwerk.kopflos=1.5", datei.getName());
    assertEquals(lauf[0], "0", lauf[1]);
    assertTrue(lauf[0], lauf[0].contains("Ich denke mir eine Zahl von 1 bis 100. Welche?"));
    assertTrue(lauf[0], lauf[0].contains("Variable Versuche = "));
  }

  @Test public void namen() {
    assertEquals("MeinProjekt", JavaExport.klassenName("Mein Projekt", "X"));
    assertEquals("laenge", JavaExport.variablenName("Länge"));
    assertEquals("meineVariable", JavaExport.variablenName("meine Variable"));
    assertEquals("forWert", JavaExport.variablenName("for"));
    assertEquals("\"Größe \\\"x\\\"\"", JavaExport.literal("Größe \"x\""));
    assertEquals(Arrays.asList("Strasse", "1"), JavaExport.woerter("Straße 1"));
  }
}
