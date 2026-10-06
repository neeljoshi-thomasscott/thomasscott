# Size charts

`size-chart.xlsx` is the master copy of the brand's size charts. The website does **not** read it:
`build.js` copies its numbers into `snippets/size-chart-data.liquid`, which Shopify serves like any theme file.
If this Excel is lost, the website keeps working.

## Changing a size chart

1. Edit `size-chart.xlsx` (keep the existing layout: one block per Article + Fit).
2. Preview the changes without writing anything:
   `node tools/size-charts/build.js --dry-run`
   It lists every changed measurement, e.g. `Regular Fit Shirts, M: Chest (IN) 43.5 → 44`.
   If the list shows changes you didn't make, you are using an old copy of the Excel — stop.
3. Apply: `node tools/size-charts/build.js`
4. Commit the Excel and `snippets/size-chart-data.liquid` together on `Thomasscott-Dev`, check the preview theme, then copy to Main.

A new Article/Fit block must also be added to `EXCEL_CHARTS` in `build.js` (the build refuses unknown blocks),
and to `snippets/size-chart-key.liquid` if products should use it.

## If the Excel is lost or damaged

`node tools/size-charts/build.js export` writes `size-chart-export.xlsx` with every chart the website shows now.
Rename it to `size-chart.xlsx` to make it the master copy again. The `_Website only` sheet holds charts that
are not yet in the Excel (they live in `legacy-charts.json`); it is ignored when building.

Every earlier version of the Excel and of the generated snippet is in git history.
