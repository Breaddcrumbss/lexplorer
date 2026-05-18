# About

Dashboard for visualising data from SG publicly available judgments.

## Subject tag visualizer

The static visualizer in `web/` reads:

- `data/subject_tree_with_count.json` for the subject hierarchy and counts
- `data/data.json` for matching judgments, courts, dates, citations, and source URLs

Run it from the repository root with a local HTTP server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/web/
```

The page supports subject search, minimum-count and depth filters, treemap navigation,
an expandable tree view, court filtering, case search, and a yearly trend for the
currently selected subject.
