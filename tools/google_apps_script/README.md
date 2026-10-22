# Google Apps Script workbook automation

This folder contains the source used by the bound Google Apps Script project for the
Preloot workbook.

## Main owner actions

- Set up / refresh workbook
- Start raid (export snapshot)
- Cancel started raid
- End raid
- Set WCL credentials
- Archive tier and activate next

## Tests

Run the story pages in `tests/` with a headless browser and check that each page prints
`PASS` in the DOM output.
