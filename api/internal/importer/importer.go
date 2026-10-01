// Package importer reads statement PDFs, works out what each one is (a
// bank account or credit card statement, or a loan or certificate history,
// from Banco Popular, or a Qik credit card statement), checks it and saves
// it. The statements command and
// the API share it.
package importer

import (
	"cmp"
	"context"
	"errors"
	"slices"
	"time"

	"github.com/powky/domfin/api/internal/gridocr"
	"github.com/powky/domfin/api/internal/pdftext"
	"github.com/powky/domfin/api/internal/statements"
	"github.com/powky/domfin/api/internal/store"
)

// Importer imports into Store, or only checks the files when Store is nil.
// PDFs that have a password open with the one saved in Store (the app's
// Settings) or, without one, with Password (the STATEMENTS_PDF_PASSWORD
// environment variable).
type Importer struct {
	Store    *store.Store
	Password string
	// AfterSave, when set, runs once after an import saved something, like
	// linking the new movements to the assets they pay into.
	AfterSave func(ctx context.Context)
}

// File is a PDF to import.
type File struct {
	Name string
	Data []byte
}

// Status says what happened to a file.
type Status string

const (
	Added     Status = "added"
	Replaced  Status = "replaced"  // a statement with the same card and cut date was there with other contents
	Unchanged Status = "unchanged" // already imported, maybe from another copy of the file
	Checked   Status = "checked"   // read and checked without saving (no store)
	Skipped   Status = "skipped"   // not a statement Domfin reads
	Failed    Status = "failed"
)

// Reasons a file was skipped or failed.
const (
	ReasonUnsupported     = "unsupported"
	ReasonMissingPassword = "missing_password"
	ReasonWrongPassword   = "wrong_password"
	ReasonUnreadable      = "unreadable"
	ReasonNotSaved        = "not_saved"
)

// Result is what importing one file did.
type Result struct {
	File   string
	Status Status
	// Reason is set for skipped and failed files, with the error in Detail
	// when the file couldn't be read or saved.
	Reason string
	Detail string
	// For statements: the account, the cut date (cards) or the date the
	// history was generated (loans), the first movement of a loan history,
	// the transactions per currency and what the checks found.
	Account  store.Account
	Date     time.Time
	From     time.Time
	Sections []Section
	Issues   []string
}

// Section counts a statement's transactions in one currency.
type Section struct {
	Currency     string
	Transactions int
}

// Imported reports whether the file was a statement that got saved or checked.
func (r Result) Imported() bool {
	return r.Status != Skipped && r.Status != Failed
}

// parsed is a file read into what it holds, before saving.
type parsed struct {
	result Result
	file   File
	card   *statements.Statement
	loan   *statements.LoanHistory
	bank   *statements.AccountStatement
	cert   *statements.CertificateHistory
}

// ImportAll imports the files and returns one result per file: statements
// first, account by account and oldest first, then the files it skipped or
// couldn't read.
func (im *Importer) ImportAll(ctx context.Context, files []File) []Result {
	password := im.password(ctx)
	var read, others []parsed
	for _, file := range files {
		p := im.read(file, password)
		if p.card == nil && p.loan == nil && p.bank == nil && p.cert == nil {
			others = append(others, p)
		} else {
			read = append(read, p)
		}
	}
	slices.SortStableFunc(read, func(a, b parsed) int {
		return cmp.Or(
			cmp.Compare(kindOrder(a.result.Account.Kind), kindOrder(b.result.Account.Kind)),
			cmp.Compare(a.result.Account.Name, b.result.Account.Name),
			cmp.Compare(a.result.Account.Last4, b.result.Account.Last4),
			a.result.Date.Compare(b.result.Date),
		)
	})
	results := make([]Result, 0, len(files))
	saved := false
	for _, p := range read {
		result := im.save(ctx, p)
		saved = saved || result.Status == Added || result.Status == Replaced
		results = append(results, result)
	}
	if saved && im.AfterSave != nil {
		im.AfterSave(ctx)
	}
	for _, p := range others {
		results = append(results, p.result)
	}
	return results
}

func kindOrder(kind string) int {
	switch kind {
	case store.Savings, store.Checking:
		return 0
	case store.CreditCard:
		return 1
	case store.Loan:
		return 2
	default:
		return 3
	}
}

// password is the one saved in Settings, or else Password.
func (im *Importer) password(ctx context.Context) string {
	if im.Store != nil {
		if saved, err := im.Store.StatementsPassword(ctx); err == nil && saved != "" {
			return saved
		}
	}
	return im.Password
}

// read opens a PDF and parses it with the first reader that recognizes it.
func (im *Importer) read(file File, password string) parsed {
	p := parsed{file: file, result: Result{File: file.Name}}
	fail := func(status Status, reason string, err error) parsed {
		p.result.Status, p.result.Reason = status, reason
		if err != nil {
			p.result.Detail = err.Error()
		}
		return p
	}

	pages, err := pdftext.Read(file.Data, password)
	switch {
	case errors.Is(err, pdftext.ErrPassword) && password == "":
		return fail(Failed, ReasonMissingPassword, nil)
	case errors.Is(err, pdftext.ErrPassword):
		return fail(Failed, ReasonWrongPassword, nil)
	case err != nil:
		return fail(Failed, ReasonUnreadable, err)
	}

	card, issues, err := statements.ParsePopularCard(pages)
	if err == nil {
		p.card = &card
		p.result.Account = store.Account{
			Kind: store.CreditCard, Institution: card.Institution, Last4: card.Last4,
			Brand: card.Brand, Product: card.Product, Name: card.Name(),
		}
		p.result.Date = card.CutDate
		for _, section := range card.Sections {
			p.result.Sections = append(p.result.Sections, Section{section.Currency, len(section.Transactions)})
		}
		p.result.Issues = issues
		return p
	}
	if !errors.Is(err, statements.ErrNotPopularCard) {
		return fail(Failed, ReasonUnreadable, err)
	}
	if card, issues, err := statements.ParseQikCard(pages); err == nil {
		p.card = &card
		p.result.Account = store.Account{Kind: store.CreditCard, Institution: card.Institution, Last4: card.Last4,
			Product: card.Product, Name: card.Name()}
		p.result.Date = card.CutDate
		p.result.Sections = []Section{{card.Sections[0].Currency, len(card.Sections[0].Transactions)}}
		p.result.Issues = issues
		return p
	} else if !errors.Is(err, statements.ErrNotQikCard) {
		return fail(Failed, ReasonUnreadable, err)
	}

	loan, issues, err := statements.ParsePopularLoan(pages)
	if err == nil {
		p.loan = &loan
		p.result.Account = store.Account{
			Kind: store.Loan, Institution: loan.Institution, Last4: loan.Last4,
			Product: loan.Product, Currency: loan.Currency,
		}
		p.result.Date = loan.AsOf
		if len(loan.Movements) > 0 {
			p.result.From = loan.Movements[0].PostedOn
		}
		p.result.Sections = []Section{{loan.Currency, len(loan.Movements)}}
		p.result.Issues = issues
		return p
	}
	if !errors.Is(err, statements.ErrNotPopularLoan) {
		return fail(Failed, ReasonUnreadable, err)
	}

	cert, issues, err := statements.ParsePopularCertificate(pages)
	if err == nil {
		p.cert = &cert
		p.result.Account = store.Account{
			Kind: store.Certificate, Institution: cert.Institution, Last4: cert.Last4, Currency: cert.Currency,
		}
		p.result.Date = cert.AsOf
		if len(cert.Movements) > 0 {
			p.result.From = cert.Movements[0].EffectiveOn
		}
		p.result.Sections = []Section{{cert.Currency, len(cert.Movements)}}
		p.result.Issues = issues
		return p
	}
	if !errors.Is(err, statements.ErrNotPopularCertificate) {
		return fail(Failed, ReasonUnreadable, err)
	}

	// Bank account statements come as page images, without text: read the
	// grid of their monospaced font.
	if hasText(pages) {
		return fail(Skipped, ReasonUnsupported, nil)
	}
	scanned, err := gridocr.ReadPDF(file.Data, gridocr.PopularAtlas())
	if err != nil {
		return fail(Failed, ReasonUnreadable, err)
	}
	texts := make([][]string, len(scanned))
	for i, page := range scanned {
		for _, line := range page.Lines {
			texts[i] = append(texts[i], line.Text)
		}
	}
	bank, issues, err := statements.ParsePopularAccount(texts)
	switch {
	case errors.Is(err, statements.ErrNotPopularAccount):
		return fail(Skipped, ReasonUnsupported, nil)
	case err != nil:
		return fail(Failed, ReasonUnreadable, err)
	}
	p.bank = &bank
	kind := store.Savings
	if bank.Checking() {
		kind = store.Checking
	}
	p.result.Account = store.Account{
		Kind: kind, Institution: bank.Institution, Last4: bank.Last4,
		Product: bank.Product, Name: bank.Name(), Currency: bank.Currency,
	}
	p.result.Date = bank.CutDate
	p.result.Sections = []Section{{bank.Currency, len(bank.Transactions)}}
	p.result.Issues = issues
	return p
}

// hasText reports whether any page has a text layer.
func hasText(pages []pdftext.Page) bool {
	for _, page := range pages {
		if len(page.Lines) > 0 {
			return true
		}
	}
	return false
}

// save stores a parsed statement, or only reports it without a store.
func (im *Importer) save(ctx context.Context, p parsed) Result {
	result := p.result
	if im.Store == nil {
		result.Status = Checked
		return result
	}
	source := store.SourceOf(p.file.Name, p.file.Data)
	var outcome store.Outcome
	var err error
	switch {
	case p.card != nil:
		outcome, err = im.Store.SaveStatement(ctx, *p.card, result.Issues, source)
	case p.loan != nil:
		outcome, err = im.Store.SaveLoanHistory(ctx, *p.loan, result.Issues, source)
	case p.cert != nil:
		outcome, err = im.Store.SaveCertificateHistory(ctx, *p.cert, result.Issues, source)
	default:
		outcome, err = im.Store.SaveAccountStatement(ctx, *p.bank, result.Issues, source)
	}
	if err != nil {
		result.Status, result.Reason, result.Detail = Failed, ReasonNotSaved, err.Error()
		return result
	}
	result.Status = map[store.Outcome]Status{store.Added: Added, store.Replaced: Replaced, store.Unchanged: Unchanged}[outcome]
	return result
}
