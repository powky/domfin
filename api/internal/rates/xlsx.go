package rates

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path"
	"strconv"
	"strings"
)

// workbook reads just enough of an .xlsx file for the BCRD series: sheet
// names, shared strings and the cell values of one sheet.
type workbook struct {
	files   map[string]*zip.File
	strings []string
	// Sheet parts by sheet name, in workbook order.
	sheetNames []string
	sheetParts map[string]string
}

func openWorkbook(data []byte) (*workbook, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("not an xlsx file: %w", err)
	}
	wb := &workbook{files: make(map[string]*zip.File, len(archive.File)), sheetParts: map[string]string{}}
	for _, file := range archive.File {
		wb.files[file.Name] = file
	}
	if err := wb.readSheets(); err != nil {
		return nil, err
	}
	if err := wb.readSharedStrings(); err != nil {
		return nil, err
	}
	return wb, nil
}

func (wb *workbook) open(name string) (io.ReadCloser, error) {
	file, ok := wb.files[name]
	if !ok {
		return nil, fmt.Errorf("xlsx part %s is missing", name)
	}
	return file.Open()
}

func (wb *workbook) decode(name string, into any) error {
	part, err := wb.open(name)
	if err != nil {
		return err
	}
	defer part.Close()
	if err := xml.NewDecoder(part).Decode(into); err != nil {
		return fmt.Errorf("xlsx part %s: %w", name, err)
	}
	return nil
}

func (wb *workbook) readSheets() error {
	var book struct {
		Sheets []struct {
			Name string `xml:"name,attr"`
			ID   string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
		} `xml:"sheets>sheet"`
	}
	if err := wb.decode("xl/workbook.xml", &book); err != nil {
		return err
	}
	var rels struct {
		Relationships []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
		} `xml:"Relationship"`
	}
	if err := wb.decode("xl/_rels/workbook.xml.rels", &rels); err != nil {
		return err
	}
	targets := make(map[string]string, len(rels.Relationships))
	for _, rel := range rels.Relationships {
		// Targets are relative to xl/, or absolute from the package root.
		if strings.HasPrefix(rel.Target, "/") {
			targets[rel.ID] = strings.TrimPrefix(rel.Target, "/")
		} else {
			targets[rel.ID] = path.Join("xl", rel.Target)
		}
	}
	for _, sheet := range book.Sheets {
		if part, ok := targets[sheet.ID]; ok {
			wb.sheetNames = append(wb.sheetNames, sheet.Name)
			wb.sheetParts[sheet.Name] = part
		}
	}
	if len(wb.sheetNames) == 0 {
		return errors.New("xlsx has no sheets")
	}
	return nil
}

func (wb *workbook) readSharedStrings() error {
	if _, ok := wb.files["xl/sharedStrings.xml"]; !ok {
		return nil
	}
	var table struct {
		Items []struct {
			Text string `xml:"t"`
			// Rich text: the string is split into formatted runs.
			Runs []struct {
				Text string `xml:"t"`
			} `xml:"r"`
		} `xml:"si"`
	}
	if err := wb.decode("xl/sharedStrings.xml", &table); err != nil {
		return err
	}
	wb.strings = make([]string, len(table.Items))
	for i, item := range table.Items {
		text := item.Text
		for _, run := range item.Runs {
			text += run.Text
		}
		wb.strings[i] = text
	}
	return nil
}

type xlsxCell struct {
	Ref    string `xml:"r,attr"`
	Type   string `xml:"t,attr"`
	Value  string `xml:"v"`
	Inline struct {
		Text string `xml:"t"`
	} `xml:"is"`
}

// eachRow calls fn with every row of a sheet as column letters to text
// ("A" → "2026"). Numbers keep their raw text, shared strings are resolved.
func (wb *workbook) eachRow(sheet string, fn func(cells map[string]string) error) error {
	name, ok := wb.sheetParts[sheet]
	if !ok {
		return fmt.Errorf("xlsx has no sheet %q", sheet)
	}
	part, err := wb.open(name)
	if err != nil {
		return err
	}
	defer part.Close()

	decoder := xml.NewDecoder(part)
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("xlsx sheet %q: %w", sheet, err)
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "row" {
			continue
		}
		var row struct {
			Cells []xlsxCell `xml:"c"`
		}
		if err := decoder.DecodeElement(&row, &start); err != nil {
			return fmt.Errorf("xlsx sheet %q: %w", sheet, err)
		}
		cells := make(map[string]string, len(row.Cells))
		for _, cell := range row.Cells {
			cells[column(cell.Ref)] = wb.text(cell)
		}
		if err := fn(cells); err != nil {
			return err
		}
	}
}

func (wb *workbook) text(cell xlsxCell) string {
	switch cell.Type {
	case "s":
		index, err := strconv.Atoi(strings.TrimSpace(cell.Value))
		if err != nil || index < 0 || index >= len(wb.strings) {
			return ""
		}
		return wb.strings[index]
	case "inlineStr":
		return cell.Inline.Text
	default:
		return cell.Value
	}
}

// column is the letter part of a cell reference: "AB12" → "AB".
func column(ref string) string {
	return strings.TrimRightFunc(ref, func(r rune) bool { return r >= '0' && r <= '9' })
}
