package rates

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"testing"
)

// buildSeries writes an .xlsx shaped like the BCRD workbook: a summary sheet
// first, then the daily sheet with `rows`. Cells that parse as numbers are
// stored as numbers and the rest as shared strings; the "Compra" header is
// stored as rich text split in two runs.
func buildSeries(t *testing.T, rows [][]string) []byte {
	t.Helper()
	var sharedStrings []string
	index := map[string]int{}
	var sheet strings.Builder
	sheet.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	for r, row := range rows {
		fmt.Fprintf(&sheet, `<row r="%d">`, r+1)
		for c, text := range row {
			if text == "" {
				continue
			}
			ref := fmt.Sprintf("%c%d", 'A'+c, r+1)
			if _, err := strconv.ParseFloat(text, 64); err == nil {
				fmt.Fprintf(&sheet, `<c r="%s" s="4"><v>%s</v></c>`, ref, text)
				continue
			}
			i, ok := index[text]
			if !ok {
				i = len(sharedStrings)
				index[text] = i
				sharedStrings = append(sharedStrings, text)
			}
			fmt.Fprintf(&sheet, `<c r="%s" t="s"><v>%d</v></c>`, ref, i)
		}
		sheet.WriteString(`</row>`)
	}
	sheet.WriteString(`</sheetData></worksheet>`)

	var shared strings.Builder
	shared.WriteString(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	for _, text := range sharedStrings {
		if text == "Compra" {
			shared.WriteString(`<si><r><t>Com</t></r><r><t>pra</t></r></si>`)
			continue
		}
		fmt.Fprintf(&shared, `<si><t xml:space="preserve">%s</t></si>`, text)
	}
	shared.WriteString(`</sst>`)

	parts := map[string]string{
		"xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
			`<sheet name="PromMensual" sheetId="2" r:id="rId2"/><sheet name="Diaria" sheetId="1" r:id="rId1"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
			`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/>` +
			`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
		"xl/sharedStrings.xml":     shared.String(),
		"xl/worksheets/sheet1.xml": sheet.String(),
		"xl/worksheets/sheet2.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`,
	}
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	for name, content := range parts {
		file, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// seriesHeader is the top of the BCRD daily sheet: a title, a blank row and the header.
var seriesHeader = [][]string{
	{"Tasas de Cambio del dólar de Referencia del Mercado Spot"},
	{},
	{"Año", "Mes", "Día", "Compra", "Venta"},
}
