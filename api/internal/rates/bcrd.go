// Package rates serves the US dollar to Dominican peso exchange rate
// published by the Banco Central de la República Dominicana (BCRD).
package rates

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

// SeriesURL is the BCRD workbook with the reference rate of the US dollar in
// the spot market ("tasa de cambio de referencia del mercado spot"), linked
// from https://www.bancentral.gov.do/a/d/2538-mercado-cambiario. Its daily
// sheet holds one row per business day since 1991 with the buy (compra) and
// sell (venta) rates, and the BCRD adds each day's row before 6:30 p.m.
// Santo Domingo time.
const SeriesURL = "https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx"

// SourceName is how responses credit the rate.
const SourceName = "Banco Central de la República Dominicana"

const (
	dailySheet     = "Diaria"
	maxSeriesBytes = 20 << 20
	userAgent      = "domfin-api/1.0"
)

// Rate is the reference rate of one business day, in pesos per dollar.
type Rate struct {
	// Date the BCRD published the rate for, "YYYY-MM-DD".
	Date string `json:"date"`
	// Buy is the compra rate: pesos the market pays for one dollar.
	Buy float64 `json:"buy"`
	// Sell is the venta rate: pesos the market charges for one dollar.
	Sell float64 `json:"sell"`
}

// Download is the outcome of asking the BCRD for its series.
type Download struct {
	Rate Rate
	// History is every day of the series, oldest first.
	History []Rate
	// NotModified is set when the series did not change since the ETag or
	// Last-Modified sent with the request; Rate is empty then.
	NotModified  bool
	ETag         string
	LastModified string
}

// Source downloads the rate series from the BCRD.
type Source struct {
	URL    string
	Client *http.Client
}

func NewSource(client *http.Client) *Source {
	return &Source{URL: SeriesURL, Client: client}
}

// Fetch downloads the series and returns its latest rate. With the ETag and
// Last-Modified of an earlier download it skips the body when nothing changed.
func (s *Source) Fetch(ctx context.Context, etag, lastModified string) (Download, error) {
	address, err := url.Parse(s.URL)
	if err != nil {
		return Download{}, err
	}
	// Some edges of the BCRD's CDN keep serving copies that are days old. A
	// query string of our own, like the version parameters in the BCRD's own
	// links, makes the CDN fetch the current file.
	query := address.Query()
	query.Set("v", strconv.FormatInt(time.Now().Unix(), 10))
	address.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address.String(), nil)
	if err != nil {
		return Download{}, err
	}
	request.Header.Set("User-Agent", userAgent)
	// Compressed answers come without an ETag, and the xlsx is already zipped.
	request.Header.Set("Accept-Encoding", "identity")
	if etag != "" {
		request.Header.Set("If-None-Match", etag)
	}
	if lastModified != "" {
		request.Header.Set("If-Modified-Since", lastModified)
	}
	response, err := s.Client.Do(request)
	if err != nil {
		return Download{}, err
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusNotModified:
		return Download{NotModified: true, ETag: etag, LastModified: lastModified}, nil
	default:
		return Download{}, fmt.Errorf("BCRD answered %s", response.Status)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSeriesBytes+1))
	if err != nil {
		return Download{}, err
	}
	if len(body) > maxSeriesBytes {
		return Download{}, errors.New("BCRD series is larger than expected")
	}
	history, err := parseSeries(body)
	if err != nil {
		return Download{}, err
	}
	return Download{Rate: history[len(history)-1], History: history, ETag: response.Header.Get("ETag"),
		LastModified: response.Header.Get("Last-Modified")}, nil
}

// parseSeries returns every rate of the daily sheet, oldest first: the
// header row names the columns (Año, Mes, Día, Compra, Venta) and each row
// below it is one business day.
func parseSeries(data []byte) ([]Rate, error) {
	wb, err := openWorkbook(data)
	if err != nil {
		return nil, err
	}
	sheet := dailySheet
	if _, ok := wb.sheetParts[sheet]; !ok {
		sheet = wb.sheetNames[0]
	}

	var columns *seriesColumns
	var history []Rate
	var year, month string
	err = wb.eachRow(sheet, func(cells map[string]string) error {
		if columns == nil {
			columns = findColumns(cells)
			return nil
		}
		// Year and month may be written only on the first row of each run.
		if value := strings.TrimSpace(cells[columns.year]); value != "" {
			year = value
		}
		if value := strings.TrimSpace(cells[columns.month]); value != "" {
			month = value
		}
		if rate, ok := columns.rate(year, month, cells); ok {
			history = append(history, rate)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if columns == nil {
		return nil, fmt.Errorf("sheet %q has no Compra/Venta header", sheet)
	}
	if len(history) == 0 {
		return nil, fmt.Errorf("sheet %q has no rates", sheet)
	}
	// Oldest first, one rate per day: a day written twice keeps its last row.
	slices.SortStableFunc(history, func(a, b Rate) int { return strings.Compare(a.Date, b.Date) })
	days := history[:0]
	for _, rate := range history {
		if len(days) > 0 && days[len(days)-1].Date == rate.Date {
			days[len(days)-1] = rate
			continue
		}
		days = append(days, rate)
	}
	return days, nil
}

type seriesColumns struct {
	year, month, day, buy, sell string
}

var unaccent = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ñ", "n")

func normalize(text string) string {
	return unaccent.Replace(strings.ToLower(strings.TrimSpace(text)))
}

// findColumns maps the header row to column letters, or returns nil when the
// row is not the header.
func findColumns(cells map[string]string) *seriesColumns {
	found := map[string]string{}
	for column, text := range cells {
		found[normalize(text)] = column
	}
	columns := seriesColumns{year: found["ano"], month: found["mes"], day: found["dia"], buy: found["compra"], sell: found["venta"]}
	if columns.year == "" || columns.month == "" || columns.day == "" || columns.buy == "" || columns.sell == "" {
		return nil
	}
	return &columns
}

func (c *seriesColumns) rate(yearText, monthText string, cells map[string]string) (Rate, bool) {
	year, okYear := wholeNumber(yearText)
	month, okMonth := parseMonth(monthText)
	day, okDay := wholeNumber(cells[c.day])
	buy, okBuy := price(cells[c.buy])
	sell, okSell := price(cells[c.sell])
	if !okYear || !okMonth || !okDay || !okBuy || !okSell || year < 1985 {
		return Rate{}, false
	}
	date := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	if date.Year() != year || int(date.Month()) != month || date.Day() != day {
		return Rate{}, false
	}
	return Rate{Date: date.Format(time.DateOnly), Buy: buy, Sell: sell}, true
}

func wholeNumber(text string) (int, bool) {
	value, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil || value != math.Trunc(value) {
		return 0, false
	}
	return int(value), true
}

// price parses a rate, rounded to the 4 decimals the BCRD publishes (the
// workbook stores binary floats such as 59.557699999999997).
func price(text string) (float64, bool) {
	value, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil || value <= 0 || math.IsInf(value, 0) {
		return 0, false
	}
	return math.Round(value*10_000) / 10_000, true
}

// The workbook abbreviates months in Spanish, with the odd English one ("Aug").
var months = map[string]int{
	"ene": 1, "jan": 1, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "may": 5, "jun": 6,
	"jul": 7, "ago": 8, "aug": 8, "sep": 9, "set": 9, "oct": 10, "nov": 11, "dic": 12, "dec": 12,
}

func parseMonth(text string) (int, bool) {
	if number, ok := wholeNumber(text); ok {
		return number, number >= 1 && number <= 12
	}
	name := []rune(normalize(text))
	if len(name) < 3 {
		return 0, false
	}
	month, ok := months[string(name[:3])]
	return month, ok
}
