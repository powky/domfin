// Command statements imports bank statement PDFs into the local database
// and reports which months each account has.
//
//	go run ./cmd/statements import [-dry-run] <pdf or folder>...
//	go run ./cmd/statements status
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/joho/godotenv"

	"github.com/powky/domfin/api/internal/importer"
	"github.com/powky/domfin/api/internal/store"
)

const passwordVar = "STATEMENTS_PDF_PASSWORD"

func main() {
	// Settings may come from .env in the folder the command runs from.
	if err := godotenv.Load(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		fmt.Fprintf(os.Stderr, "no se pudo leer .env: %v\n", err)
		os.Exit(1)
	}
	if len(os.Args) < 2 {
		usage(os.Stderr)
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "import":
		err = runImport(os.Args[2:], os.Stdout)
	case "status":
		err = runStatus(os.Stdout)
	default:
		usage(os.Stderr)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func usage(w io.Writer) {
	fmt.Fprintln(w, `uso:
  go run ./cmd/statements import [-dry-run] <pdf o carpeta>...   importa estados de cuenta y de tarjeta, e historiales de préstamo y de certificado, del Banco Popular
  go run ./cmd/statements status                                 muestra qué meses tiene cada cuenta`)
}

func runImport(args []string, out io.Writer) error {
	flags := flag.NewFlagSet("import", flag.ContinueOnError)
	dryRun := flags.Bool("dry-run", false, "lee y revisa los PDF sin guardar nada")
	if err := flags.Parse(args); err != nil {
		return err
	}
	paths, err := pdfFiles(flags.Args())
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		return errors.New("no hay PDF que importar: pasa archivos o carpetas")
	}

	im := &importer.Importer{Password: os.Getenv(passwordVar)}
	if !*dryRun {
		if im.Store, err = store.Open(store.DefaultPath()); err != nil {
			return fmt.Errorf("abrir la base local: %w", err)
		}
		defer im.Store.Close()
	}

	var files []importer.File
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		files = append(files, importer.File{Name: filepath.Base(path), Data: data})
	}
	failed := 0
	for _, result := range im.ImportAll(context.Background(), files) {
		fmt.Fprintln(out, describe(result))
		if result.Status == importer.Failed {
			failed++
		}
	}
	if im.Store != nil {
		fmt.Fprintln(out)
		if err := printStatus(context.Background(), im.Store, out); err != nil {
			return err
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d archivo(s) no se pudieron importar", failed)
	}
	return nil
}

// describe tells what importing a file did in one line, plus one per issue.
func describe(r importer.Result) string {
	switch r.Status {
	case importer.Skipped:
		return fmt.Sprintf("– %s: omitido, no es un estado que Domfin sepa leer", r.File)
	case importer.Failed:
		switch r.Reason {
		case importer.ReasonMissingPassword:
			return fmt.Sprintf("✗ %s: tiene contraseña; guárdala en Configuración de la app o ponla en %s", r.File, passwordVar)
		case importer.ReasonWrongPassword:
			return fmt.Sprintf("✗ %s: la contraseña no lo abre", r.File)
		default:
			return fmt.Sprintf("✗ %s: %s", r.File, r.Detail)
		}
	}

	mark := "✓"
	if len(r.Issues) > 0 {
		mark = "⚠"
	}
	outcome := map[importer.Status]string{
		importer.Added:     "importado",
		importer.Replaced:  "reemplazó al que había",
		importer.Unchanged: "ya estaba importado",
		importer.Checked:   "revisado, sin guardar",
	}[r.Status]
	var sections []string
	for _, section := range r.Sections {
		sections = append(sections, fmt.Sprintf("%s %d mov.", section.Currency, section.Transactions))
	}
	period := "corte " + r.Date.Format("2006-01-02")
	if r.Account.Kind == store.Loan || r.Account.Kind == store.Certificate {
		period = "historial al " + r.Date.Format("2006-01-02")
		if !r.From.IsZero() {
			period += ", desde " + r.From.Format("2006-01-02")
		}
	}
	line := fmt.Sprintf("%s %s · %s · %s · %s  (%s)", mark, accountName(r.Account), period,
		strings.Join(sections, " · "), outcome, r.File)
	for _, issue := range r.Issues {
		line += "\n    " + issue
	}
	return line
}

// accountName is "Contigo ****1234" for a card and "Préstamo ****5678" for
// a loan or "Certificado ****9012" for a certificate, whose histories don't
// print a product name.
func accountName(a store.Account) string {
	name := a.Name
	switch {
	case a.Kind == store.Certificate:
		name = "Certificado"
	case a.Kind == store.Loan || name == "":
		name = "Préstamo"
	}
	return name + " ****" + a.Last4
}

func runStatus(out io.Writer) error {
	db, err := store.Open(store.DefaultPath())
	if err != nil {
		return fmt.Errorf("abrir la base local: %w", err)
	}
	defer db.Close()
	return printStatus(context.Background(), db, out)
}

// printStatus lists each account's months: ✓ imported and checks out,
// ⚠ imported with problems, · missing.
func printStatus(ctx context.Context, db *store.Store, out io.Writer) error {
	accounts, err := db.Coverage(ctx)
	if err != nil {
		return err
	}
	if len(accounts) == 0 {
		fmt.Fprintln(out, "Todavía no hay estados importados.")
		return nil
	}
	for i, account := range accounts {
		if i > 0 {
			fmt.Fprintln(out)
		}
		title := accountName(account.Account)
		if account.Account.Brand != "" {
			title = fmt.Sprintf("%s · %s ****%s", account.Account.Name, account.Account.Brand, account.Account.Last4)
		}
		fmt.Fprintln(out, title)
		for _, month := range account.Months {
			if !month.Imported() {
				fmt.Fprintf(out, "  %s  ·  falta el estado\n", month.Month)
				continue
			}
			mark := "✓"
			if !month.OK() {
				mark = "⚠"
			}
			var sections []string
			for _, section := range month.Sections {
				sections = append(sections, fmt.Sprintf("%s %d mov.", section.Currency, section.Transactions))
			}
			period := "corte " + month.Date
			if account.Account.Kind == store.Loan || account.Account.Kind == store.Certificate {
				period = "historial al " + month.Date
			}
			fmt.Fprintf(out, "  %s  %s  %s · %s\n", month.Month, mark, period, strings.Join(sections, " · "))
			for _, issue := range month.Issues {
				fmt.Fprintf(out, "      %s\n", issue)
			}
		}
	}
	return nil
}

// pdfFiles expands folders (recursively) into the PDFs they hold.
func pdfFiles(args []string) ([]string, error) {
	var files []string
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			files = append(files, arg)
			continue
		}
		err = filepath.WalkDir(arg, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !entry.IsDir() && strings.EqualFold(filepath.Ext(path), ".pdf") {
				files = append(files, path)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	slices.Sort(files)
	return slices.Compact(files), nil
}
