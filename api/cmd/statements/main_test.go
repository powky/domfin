package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/powky/domfin/api/internal/testpdf"
)

const testPassword = "clave de prueba"

func writeStatement(t *testing.T, dir string) {
	t.Helper()
	for name, data := range map[string][]byte{
		"estado.pdf":    testpdf.PopularCard(t, testPassword),
		"historial.pdf": testpdf.PopularLoan(t),
		"cuenta.pdf":    testpdf.PopularAccount(t),
		"cd.pdf":        testpdf.PopularCertificate(t),
		"otro.pdf":      testpdf.Build(t, "", []testpdf.Text{{X: 50, Y: 100, S: "Estado de Cuenta - TC 0000"}}),
	} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestImportAndStatus(t *testing.T) {
	folder := t.TempDir()
	writeStatement(t, folder)
	t.Setenv("DOMFIN_DATA_DIR", t.TempDir())
	t.Setenv(passwordVar, testPassword)

	var out strings.Builder
	if err := runImport([]string{folder}, &out); err != nil {
		t.Fatalf("import: %v\n%s", err, out.String())
	}
	want := `✓ Ahorro Empleado ****1234 · corte 2026-08-20 · DOP 4 mov. · importado  (cuenta.pdf)
✓ Prueba ****1234 · corte 2026-01-28 · DOP 2 mov. · USD 1 mov. · importado  (estado.pdf)
✓ Préstamo ****1234 · historial al 2026-09-30, desde 2026-01-10 · DOP 2 mov. · importado  (historial.pdf)
✓ Certificado ****1234 · historial al 2026-09-30, desde 2026-07-22 · DOP 5 mov. · importado  (cd.pdf)
– otro.pdf: omitido, no es un estado que Domfin sepa leer

Ahorro Empleado ****1234
  2026-08  ✓  corte 2026-08-20 · DOP 4 mov.

Prueba · Mastercard ****1234
  2026-01  ✓  corte 2026-01-28 · DOP 2 mov. · USD 1 mov.

Préstamo ****1234
  2026-01  ✓  historial al 2026-09-30 · DOP 1 mov.
  2026-02  ✓  historial al 2026-09-30 · DOP 1 mov.
  2026-03  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-04  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-05  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-06  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-07  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-08  ✓  historial al 2026-09-30 · DOP 0 mov.
  2026-09  ✓  historial al 2026-09-30 · DOP 0 mov.

Certificado ****1234
  2026-07  ✓  historial al 2026-09-30 · DOP 1 mov.
  2026-08  ✓  historial al 2026-09-30 · DOP 2 mov.
  2026-09  ✓  historial al 2026-09-30 · DOP 2 mov.
`
	if out.String() != want {
		t.Errorf("import output:\n%s\nwant:\n%s", out.String(), want)
	}

	out.Reset()
	if err := runImport([]string{filepath.Join(folder, "estado.pdf")}, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(out.String(), "✓ Prueba ****1234 · corte 2026-01-28 · DOP 2 mov. · USD 1 mov. · ya estaba importado") {
		t.Errorf("second import:\n%s", out.String())
	}
}

func TestImportWithTheWrongPassword(t *testing.T) {
	folder := t.TempDir()
	writeStatement(t, folder)
	t.Setenv("DOMFIN_DATA_DIR", t.TempDir())

	for password, message := range map[string]string{
		"":           "✗ estado.pdf: tiene contraseña; guárdala en Configuración de la app o ponla en STATEMENTS_PDF_PASSWORD",
		"otra clave": "✗ estado.pdf: la contraseña no lo abre",
	} {
		t.Setenv(passwordVar, password)
		var out strings.Builder
		err := runImport([]string{"-dry-run", filepath.Join(folder, "estado.pdf")}, &out)
		if err == nil || !strings.Contains(out.String(), message) {
			t.Errorf("password %q: err = %v, output:\n%s", password, err, out.String())
		}
		if strings.Contains(out.String(), password) && password != "" {
			t.Errorf("the output shows the password")
		}
	}
}
