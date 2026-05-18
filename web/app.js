const SUBJECT_SEPARATOR = " \u2014 ";
const DATA_PATHS = {
  tree: "../data/subject_tree_with_count.json",
  cases: "../data/data.json",
};

const state = {
  root: null,
  selected: null,
  allNodes: [],
  cases: [],
  casesLoaded: false,
  expanded: new Set(["root"]),
  filters: {
    subjectQuery: "",
    minCount: 1,
    maxDepth: 4,
    sortOrder: "count",
    court: "all",
    caseQuery: "",
  },
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  tagCount: document.querySelector("#tagCount"),
  leafCount: document.querySelector("#leafCount"),
  maxDepth: document.querySelector("#maxDepth"),
  caseCount: document.querySelector("#caseCount"),
  subjectSearch: document.querySelector("#subjectSearch"),
  minCount: document.querySelector("#minCount"),
  minCountValue: document.querySelector("#minCountValue"),
  maxDepthFilter: document.querySelector("#maxDepthFilter"),
  sortOrder: document.querySelector("#sortOrder"),
  resetFilters: document.querySelector("#resetFilters"),
  expandTree: document.querySelector("#expandTree"),
  collapseTree: document.querySelector("#collapseTree"),
  courtFilter: document.querySelector("#courtFilter"),
  caseSearch: document.querySelector("#caseSearch"),
  topSubjects: document.querySelector("#topSubjects"),
  scopeTitle: document.querySelector("#scopeTitle"),
  breadcrumb: document.querySelector("#breadcrumb"),
  parentScope: document.querySelector("#parentScope"),
  rootScope: document.querySelector("#rootScope"),
  treemap: document.querySelector("#treemap"),
  visibleTileCount: document.querySelector("#visibleTileCount"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedCount: document.querySelector("#selectedCount"),
  selectedPath: document.querySelector("#selectedPath"),
  selectedChildren: document.querySelector("#selectedChildren"),
  selectedDepth: document.querySelector("#selectedDepth"),
  timeline: document.querySelector("#timeline"),
  treeList: document.querySelector("#treeList"),
  visibleNodeCount: document.querySelector("#visibleNodeCount"),
  casesTitle: document.querySelector("#casesTitle"),
  caseResultCount: document.querySelector("#caseResultCount"),
  casesList: document.querySelector("#casesList"),
};

const colorPalette = [
  "#176d77",
  "#8a5a1f",
  "#6b5b95",
  "#2f6f4e",
  "#a4554f",
  "#3f5f8f",
  "#8a6d2f",
  "#4f6f74",
  "#8d4b6a",
  "#58713f",
  "#7a4d8f",
  "#a34a28",
];

init();

async function init() {
  bindControls();

  try {
    els.dataStatus.textContent = "Loading subject tree...";
    const treeData = await fetchJson(DATA_PATHS.tree);
    state.root = buildTree(treeData);
    state.selected = state.root;
    updateTreeMetrics();
    renderAll();

    els.dataStatus.textContent = "Loading judgments...";
    loadCases();
  } catch (error) {
    els.dataStatus.textContent = "Could not load data. Start a local HTTP server from the repo root.";
    renderError(els.treeList, error);
    renderSvgMessage(String(error.message || error));
  }
}

async function loadCases() {
  try {
    const rows = await fetchJson(DATA_PATHS.cases);
    state.cases = rows.map(normalizeCase);
    state.casesLoaded = true;
    hydrateCourtFilter();
    els.caseSearch.disabled = false;
    els.courtFilter.disabled = false;
    els.caseCount.textContent = formatNumber(state.cases.length);
    els.dataStatus.textContent = `${formatNumber(state.allNodes.length - 1)} tags from ${formatNumber(state.cases.length)} judgments.`;
    renderCases();
  } catch (error) {
    state.casesLoaded = false;
    els.caseCount.textContent = "-";
    els.dataStatus.textContent = "Subject tree loaded. Judgment records were not available.";
    els.caseResultCount.textContent = "Unavailable";
    renderError(els.casesList, error);
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function bindControls() {
  els.subjectSearch.addEventListener("input", () => {
    state.filters.subjectQuery = normalizeText(els.subjectSearch.value);
    renderSubjectViews();
  });

  els.minCount.addEventListener("input", () => {
    state.filters.minCount = Number(els.minCount.value);
    els.minCountValue.textContent = formatNumber(state.filters.minCount);
    renderSubjectViews();
  });

  els.maxDepthFilter.addEventListener("change", () => {
    state.filters.maxDepth = Number(els.maxDepthFilter.value);
    renderSubjectViews();
  });

  els.sortOrder.addEventListener("change", () => {
    state.filters.sortOrder = els.sortOrder.value;
    renderSubjectViews();
  });

  els.resetFilters.addEventListener("click", () => {
    els.subjectSearch.value = "";
    els.minCount.value = "1";
    els.maxDepthFilter.value = "4";
    els.sortOrder.value = "count";
    state.filters.subjectQuery = "";
    state.filters.minCount = 1;
    state.filters.maxDepth = 4;
    state.filters.sortOrder = "count";
    els.minCountValue.textContent = "1";
    renderSubjectViews();
  });

  els.expandTree.addEventListener("click", () => {
    collectVisibleNodes(state.selected).forEach((node) => {
      if (node.children.length) state.expanded.add(node.id);
    });
    renderTreeList();
  });

  els.collapseTree.addEventListener("click", () => {
    state.expanded = new Set([state.selected.id]);
    renderTreeList();
  });

  els.rootScope.addEventListener("click", () => selectNode(state.root));

  els.parentScope.addEventListener("click", () => {
    if (state.selected.parent) selectNode(state.selected.parent);
  });

  els.courtFilter.addEventListener("change", () => {
    state.filters.court = els.courtFilter.value;
    renderCases();
  });

  els.caseSearch.addEventListener("input", () => {
    state.filters.caseQuery = normalizeText(els.caseSearch.value);
    renderCases();
  });

  window.addEventListener("resize", debounce(() => renderTreemap(), 120));

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(debounce(() => renderTreemap(), 80));
    observer.observe(els.treemap);
  }
}

function buildTree(rawTree) {
  const root = {
    id: "root",
    name: "All subjects",
    count: 0,
    depth: 0,
    path: [],
    pathText: "All subjects",
    searchText: "",
    children: [],
    parent: null,
  };

  const nodes = [root];

  function visit(name, rawNode, parent, depth) {
    const path = [...parent.path, name];
    const node = {
      id: path.map(encodeURIComponent).join("/"),
      name,
      count: Number(rawNode?._count || 0),
      depth,
      path,
      pathText: path.join(SUBJECT_SEPARATOR),
      searchText: normalizeText(`${name} ${path.join(" ")}`),
      children: [],
      parent,
    };
    nodes.push(node);

    const children = rawNode?._children || {};
    node.children = Object.entries(children).map(([childName, child]) =>
      visit(childName, child, node, depth + 1),
    );
    return node;
  }

  root.children = Object.entries(rawTree).map(([name, rawNode]) =>
    visit(name, rawNode, root, 1),
  );
  root.count = root.children.reduce((sum, node) => sum + node.count, 0);
  root.searchText = normalizeText(root.children.map((node) => node.name).join(" "));
  state.allNodes = nodes;
  return root;
}

function normalizeCase(row) {
  const tags = parseSubjectTags(row.subject_tags);
  return {
    ...row,
    tags,
    tagSearch: normalizeText(tags.join(" ")),
    searchable: normalizeText(
      [
        row.case_name,
        row.citation,
        row.case_numbers,
        row.court,
        row.summary,
        row.court_summary,
        tags.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    year: parseYear(row.decision_date),
  };
}

function parseSubjectTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return value
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseYear(value) {
  if (!value || typeof value !== "string") return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function hydrateCourtFilter() {
  const counts = new Map();
  state.cases.forEach((row) => {
    if (!row.court) return;
    counts.set(row.court, (counts.get(row.court) || 0) + 1);
  });

  const options = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  els.courtFilter.replaceChildren(makeOption("all", "All courts"));
  options.forEach(([court, count]) => {
    els.courtFilter.append(makeOption(court, `${court} (${formatNumber(count)})`));
  });
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function updateTreeMetrics() {
  const nodes = state.allNodes.slice(1);
  const leaves = nodes.filter((node) => node.children.length === 0).length;
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const maxRootCount = Math.max(...state.root.children.map((node) => node.count), 1);
  const sliderMax = Math.max(100, Math.ceil(maxRootCount / 50) * 50);

  els.tagCount.textContent = formatNumber(nodes.length);
  els.leafCount.textContent = formatNumber(leaves);
  els.maxDepth.textContent = formatNumber(maxDepth);
  els.caseCount.textContent = "-";
  els.minCount.max = String(sliderMax);
  els.minCountValue.textContent = formatNumber(state.filters.minCount);

  renderTopSubjects();
}

function renderAll() {
  renderScope();
  renderSubjectViews();
  renderCases();
}

function renderSubjectViews() {
  renderTreemap();
  renderTreeList();
}

function renderScope() {
  const selected = state.selected;
  els.scopeTitle.textContent = selected.name;
  els.selectedTitle.textContent = selected.name;
  els.selectedCount.textContent = formatNumber(selected.count);
  els.selectedPath.textContent = selected.path.length ? selected.pathText : "All subjects";
  els.selectedChildren.textContent = formatNumber(selected.children.length);
  els.selectedDepth.textContent = selected.depth === 0 ? "Root" : formatNumber(selected.depth);
  els.parentScope.disabled = !selected.parent;

  renderBreadcrumb();
}

function renderBreadcrumb() {
  const parts = state.selected.path.length ? state.selected.path : [];
  const fragment = document.createDocumentFragment();

  const rootButton = document.createElement("button");
  rootButton.type = "button";
  rootButton.textContent = "All";
  rootButton.addEventListener("click", () => selectNode(state.root));
  fragment.append(rootButton);

  let cursor = state.root;
  parts.forEach((name) => {
    const separator = document.createElement("span");
    separator.textContent = "/";
    fragment.append(separator);

    cursor = cursor.children.find((child) => child.name === name) || cursor;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    const target = cursor;
    button.addEventListener("click", () => selectNode(target));
    fragment.append(button);
  });

  els.breadcrumb.replaceChildren(fragment);
}

function renderTopSubjects() {
  const top = [...state.root.children].sort(byCountThenName).slice(0, 12);
  const fragment = document.createDocumentFragment();

  top.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "top-topic";
    button.title = node.pathText;
    button.addEventListener("click", () => selectNode(node));

    const name = document.createElement("span");
    name.textContent = node.name;
    const count = document.createElement("strong");
    count.textContent = formatNumber(node.count);

    button.append(name, count);
    fragment.append(button);
  });

  els.topSubjects.replaceChildren(fragment);
}

function renderTreemap() {
  if (!state.root) return;

  const nodes = getFilteredChildren(state.selected, 1);
  els.visibleTileCount.textContent = `${formatNumber(nodes.length)} ${plural(nodes.length, "tile", "tiles")}`;
  clearSvg(els.treemap);

  const width = Math.max(320, Math.floor(els.treemap.clientWidth || 900));
  const height = Math.max(280, Math.floor(els.treemap.clientHeight || 480));
  els.treemap.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!nodes.length) {
    renderSvgMessage("No matching child subjects");
    return;
  }

  const margin = 8;
  const layout = binaryTreemap(
    nodes.map((node) => ({ node, value: Math.max(1, node.count) })),
    margin,
    margin,
    width - margin * 2,
    height - margin * 2,
  );

  const fragment = document.createDocumentFragment();
  layout.forEach((tile) => fragment.append(renderTile(tile)));
  els.treemap.append(fragment);
}

function renderTile(tile) {
  const group = svgEl("g");
  group.classList.add("tile");
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `${tile.node.name}, ${formatNumber(tile.node.count)} references`);
  group.addEventListener("click", () => selectNode(tile.node));
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode(tile.node);
    }
  });

  const rect = svgEl("rect");
  rect.setAttribute("x", tile.x.toFixed(2));
  rect.setAttribute("y", tile.y.toFixed(2));
  rect.setAttribute("width", Math.max(0, tile.w).toFixed(2));
  rect.setAttribute("height", Math.max(0, tile.h).toFixed(2));
  rect.setAttribute("rx", "5");
  rect.setAttribute("fill", colorForNode(tile.node));

  group.append(rect);

  const title = svgEl("title");
  title.textContent = `${tile.node.pathText}: ${formatNumber(tile.node.count)}`;
  group.append(title);

  const padding = 10;
  if (tile.w > 74 && tile.h > 42) {
    const label = svgEl("text");
    label.classList.add("tile-label");
    label.setAttribute("x", (tile.x + padding).toFixed(2));
    label.setAttribute("y", (tile.y + 24).toFixed(2));
    label.textContent = truncate(tile.node.name, Math.floor((tile.w - padding * 2) / 8));
    group.append(label);
  }

  if (tile.w > 60 && tile.h > 64) {
    const count = svgEl("text");
    count.classList.add("tile-count");
    count.setAttribute("x", (tile.x + padding).toFixed(2));
    count.setAttribute("y", (tile.y + 44).toFixed(2));
    count.textContent = formatNumber(tile.node.count);
    group.append(count);
  }

  return group;
}

function binaryTreemap(items, x, y, w, h) {
  if (!items.length || w <= 0 || h <= 0) return [];
  if (items.length === 1) {
    return [{ node: items[0].node, x, y, w, h }];
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const split = splitItems(items, total);
  const firstTotal = split.first.reduce((sum, item) => sum + item.value, 0);
  const ratio = total > 0 ? firstTotal / total : 0.5;

  if (w >= h) {
    const firstWidth = Math.round(w * ratio);
    return [
      ...binaryTreemap(split.first, x, y, firstWidth, h),
      ...binaryTreemap(split.second, x + firstWidth, y, w - firstWidth, h),
    ];
  }

  const firstHeight = Math.round(h * ratio);
  return [
    ...binaryTreemap(split.first, x, y, w, firstHeight),
    ...binaryTreemap(split.second, x, y + firstHeight, w, h - firstHeight),
  ];
}

function splitItems(items, total) {
  const half = total / 2;
  let running = 0;
  let splitAt = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length - 1; index += 1) {
    running += items[index].value;
    const distance = Math.abs(half - running);
    if (distance < bestDistance) {
      bestDistance = distance;
      splitAt = index + 1;
    }
  }

  return {
    first: items.slice(0, splitAt),
    second: items.slice(splitAt),
  };
}

function renderTreeList() {
  if (!state.root) return;

  state.expanded.add(state.selected.id);
  const visibleNodes = collectVisibleNodes(state.selected);
  const maxRows = 650;
  const rows = visibleNodes.slice(0, maxRows);
  const fragment = document.createDocumentFragment();

  if (!rows.length) {
    els.visibleNodeCount.textContent = "0 nodes";
    renderEmpty(els.treeList, "No matching subjects");
    return;
  }

  rows.forEach((node) => fragment.append(renderTreeRow(node)));
  if (visibleNodes.length > maxRows) {
    const limit = document.createElement("div");
    limit.className = "row-limit";
    limit.textContent = `${formatNumber(visibleNodes.length - maxRows)} more nodes hidden by the row limit`;
    fragment.append(limit);
  }

  els.visibleNodeCount.textContent = `${formatNumber(visibleNodes.length)} ${plural(visibleNodes.length, "node", "nodes")}`;
  els.treeList.replaceChildren(fragment);
}

function collectVisibleNodes(scope) {
  const rows = [];
  const children = getFilteredChildren(scope, 1);

  function walk(node) {
    rows.push(node);
    if (!state.expanded.has(node.id)) return;
    getFilteredChildren(node, node.depth - scope.depth + 1).forEach(walk);
  }

  children.forEach(walk);
  return rows;
}

function renderTreeRow(node) {
  const row = document.createElement("div");
  row.className = "tree-row";
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(node.depth - state.selected.depth));
  row.style.setProperty("--level", String(Math.max(0, node.depth - state.selected.depth - 1)));
  if (node === state.selected) row.classList.add("is-selected");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tree-toggle";
  toggle.disabled = node.children.length === 0;
  toggle.setAttribute("aria-label", `${state.expanded.has(node.id) ? "Collapse" : "Expand"} ${node.name}`);
  toggle.textContent = state.expanded.has(node.id) ? "-" : "+";
  toggle.addEventListener("click", () => {
    if (state.expanded.has(node.id)) state.expanded.delete(node.id);
    else state.expanded.add(node.id);
    renderTreeList();
  });

  const label = document.createElement("button");
  label.type = "button";
  label.className = "tree-label";
  label.title = node.pathText;
  label.textContent = node.name;
  label.addEventListener("click", () => selectNode(node));

  const meta = document.createElement("div");
  meta.className = "tree-meta";
  const track = document.createElement("span");
  track.className = "count-track";
  const bar = document.createElement("span");
  bar.className = "count-bar";
  const max = Math.max(1, state.selected.count);
  bar.style.width = `${Math.max(4, Math.min(100, (node.count / max) * 100))}%`;
  track.append(bar);

  const count = document.createElement("span");
  count.textContent = formatNumber(node.count);
  meta.append(track, count);

  row.append(toggle, label, meta);
  return row;
}

function getFilteredChildren(parent, relativeDepth) {
  if (relativeDepth > state.filters.maxDepth) return [];

  return sortNodes(parent.children)
    .map((node) => ({
      node,
      descendants: getFilteredChildren(node, relativeDepth + 1),
    }))
    .filter(({ node, descendants }) => shouldShowNode(node, descendants))
    .map(({ node }) => node);
}

function shouldShowNode(node, filteredDescendants) {
  const countMatch = node.count >= state.filters.minCount;
  const query = state.filters.subjectQuery;
  const queryMatch = !query || node.searchText.includes(query);
  return countMatch && (queryMatch || filteredDescendants.length > 0);
}

function sortNodes(nodes) {
  const sorted = [...nodes];
  if (state.filters.sortOrder === "name") {
    return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted.sort(byCountThenName);
}

function byCountThenName(a, b) {
  return b.count - a.count || a.name.localeCompare(b.name);
}

function renderCases() {
  if (!state.casesLoaded) {
    els.caseResultCount.textContent = "Loading";
    renderEmpty(els.casesList, "Loading judgment records");
    renderTimeline([]);
    return;
  }

  const matches = filteredCases();
  const visible = matches.slice(0, 35);
  const fragment = document.createDocumentFragment();

  els.casesTitle.textContent =
    state.selected === state.root ? "Recent judgments" : `Judgments tagged ${state.selected.name}`;
  els.caseResultCount.textContent = `${formatNumber(matches.length)} ${plural(matches.length, "case", "cases")}`;

  if (!matches.length) {
    renderEmpty(els.casesList, "No judgments match the selected filters");
  } else {
    visible.forEach((row) => fragment.append(renderCaseCard(row)));
    if (matches.length > visible.length) {
      const limit = document.createElement("div");
      limit.className = "row-limit";
      limit.textContent = `${formatNumber(matches.length - visible.length)} more matches hidden`;
      fragment.append(limit);
    }
    els.casesList.replaceChildren(fragment);
  }

  renderTimeline(matches);
}

function filteredCases() {
  const selected = state.selected;
  const selectedPath = selected.pathText;
  const selectedPathLower = normalizeText(selectedPath);
  const selectedPrefixLower = normalizeText(`${selectedPath}${SUBJECT_SEPARATOR}`);
  const query = state.filters.caseQuery;

  return state.cases
    .filter((row) => {
      if (state.filters.court !== "all" && row.court !== state.filters.court) return false;
      if (query && !row.searchable.includes(query)) return false;
      if (selected === state.root) return true;
      return row.tags.some((tag) => {
        const normalized = normalizeText(tag);
        return normalized === selectedPathLower || normalized.startsWith(selectedPrefixLower);
      });
    })
    .sort((a, b) => String(b.decision_date || "").localeCompare(String(a.decision_date || "")));
}

function renderCaseCard(row) {
  const card = document.createElement("article");
  card.className = "case-card";

  const header = document.createElement("header");
  const title = document.createElement("h4");
  title.textContent = row.case_name || "Untitled judgment";

  const link = document.createElement("a");
  link.href = row.source_url || row.pdf_url || "#";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = row.citation || "Open";

  header.append(title, link);

  const meta = document.createElement("div");
  meta.className = "case-meta";
  [row.court, row.decision_date, row.case_numbers].filter(Boolean).forEach((item) => {
    const span = document.createElement("span");
    span.textContent = item;
    meta.append(span);
  });

  const summary = document.createElement("p");
  summary.className = "case-summary";
  summary.textContent = row.summary || row.court_summary || "No summary available.";

  const tags = document.createElement("div");
  tags.className = "case-tags";
  row.tags.slice(0, 4).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.title = tag;
    chip.textContent = tag;
    tags.append(chip);
  });

  card.append(header, meta, summary, tags);
  return card;
}

function renderTimeline(rows) {
  els.timeline.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No yearly trend available";
    els.timeline.append(empty);
    return;
  }

  const counts = new Map();
  rows.forEach((row) => {
    if (!row.year) return;
    counts.set(row.year, (counts.get(row.year) || 0) + 1);
  });

  if (!counts.size) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No dated judgments";
    els.timeline.append(empty);
    return;
  }

  const years = [...counts.keys()].sort((a, b) => a - b);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const peak = Math.max(...counts.values());
  const fragment = document.createDocumentFragment();

  for (let year = min; year <= max; year += 1) {
    const count = counts.get(year) || 0;
    const bar = document.createElement("div");
    bar.className = "timeline-bar";
    bar.style.height = `${Math.max(2, (count / peak) * 100)}%`;
    bar.title = `${year}: ${formatNumber(count)}`;

    const label = document.createElement("span");
    label.textContent = `${year}: ${formatNumber(count)}`;
    bar.append(label);
    fragment.append(bar);
  }

  els.timeline.append(fragment);
}

function selectNode(node) {
  if (!node) return;
  state.selected = node;
  state.expanded.add(node.id);
  renderScope();
  renderSubjectViews();
  renderCases();
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function renderSvgMessage(message) {
  clearSvg(els.treemap);
  const width = Math.max(320, Math.floor(els.treemap.clientWidth || 900));
  const height = Math.max(280, Math.floor(els.treemap.clientHeight || 480));
  els.treemap.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const text = svgEl("text");
  text.setAttribute("x", String(width / 2));
  text.setAttribute("y", String(height / 2));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "#607078");
  text.setAttribute("font-weight", "700");
  text.textContent = message;
  els.treemap.append(text);
}

function renderEmpty(container, message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  container.replaceChildren(empty);
}

function renderError(container, error) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = String(error.message || error);
  container.replaceChildren(empty);
}

function svgEl(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function colorForNode(node) {
  const index = Math.abs(hashCode(node.pathText || node.name)) % colorPalette.length;
  return colorPalette[index];
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function truncate(value, maxLength) {
  if (maxLength <= 3) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-SG").format(Number(value) || 0);
}

function plural(count, singular, pluralValue) {
  return count === 1 ? singular : pluralValue;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
