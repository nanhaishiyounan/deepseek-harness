## UI Pro Max Search Results
**Domain:** chart | **Query:** mobile mini kpi
**Source:** charts.csv | **Found:** 6 results

### Result 1
- **Data Type:** Performance vs Target
- **Keywords:** performance, target, kpi, gauge, goal, threshold, progress
- **Best Chart Type:** Gauge Chart or Bullet Chart
- **Secondary Options:** Dial, Thermometer
- **When to Use:** Single KPI measured against a defined target or threshold; dashboard summary context
- **When NOT to Use:** No target or benchmark exists; comparing multiple KPIs at once (use bullet chart grid)
- **Data Volume Threshold:** Single metric per gauge; for 3+ KPIs use bullet chart grid layout
- **Color Guidance:** Performance: Red → Yellow → Green gradient. Target: marker line. Threshold zones clearly differentiated
- **Accessibility Grade:** AA
- **Accessibility Notes:** Always show numerical value + % of target as text beside chart. Never rely on color position alone.
- **A11y Fallback:** Numerical value + % of target shown as visible text; ARIA live region for real-time updates
- **Library Recommendation:** D3.js, ApexCharts, Custom SVG
- **Interactive Level:** Hover

### Result 2
- **Data Type:** Performance vs Target (Compact)
- **Keywords:** bullet, compact, kpi, dashboard, target, benchmark, range
- **Best Chart Type:** Bullet Chart
- **Secondary Options:** Gauge, Progress Bar
- **When to Use:** Dashboard with multiple KPIs side by side; space-constrained contexts where a gauge is too large
- **When NOT to Use:** Single KPI with emphasis (use gauge); data has no defined target range; fewer than 3 KPIs
- **Data Volume Threshold:** Ideal for 3–10 bullet charts in a grid; scales to any count efficiently
- **Color Guidance:** Qualitative ranges: #FFCDD2 / #FFF9C4 / #C8E6C9 (bad/ok/good). Performance bar: #1976D2. Target: black 3px marker
- **Accessibility Grade:** AAA
- **Accessibility Notes:** All values always visible as text. Color ranges are labeled with text thresholds not color alone.
- **A11y Fallback:** Numerical values always visible (not hover-only); color ranges labeled with threshold text
- **Library Recommendation:** D3.js, Plotly, Custom SVG
- **Interactive Level:** Hover

### Result 3
- **Data Type:** Flow / Process Data
- **Keywords:** flow, process, sankey, distribution, source, target, transfer
- **Best Chart Type:** Sankey Diagram
- **Secondary Options:** Alluvial, Chord Diagram
- **When to Use:** Showing how quantities flow between nodes; multi-source multi-target distribution
- **When NOT to Use:** Flow directions form loops (use network graph); fewer than 3 source-target pairs; mobile-primary context
- **Data Volume Threshold:** <50 flows: SVG; ≥50: Canvas; >200 flows: aggregate minor flows into 'Other' node
- **Color Guidance:** Gradient from source to target color. Flow opacity: 0.4–0.6. Node labels always visible
- **Accessibility Grade:** C
- **Accessibility Notes:** Structural flow charts cannot be conveyed by color alone. Provide flow table. Avoid on mobile.
- **A11y Fallback:** Flow table (Source → Target → Value); keyboard-traversable node list with tab stops
- **Library Recommendation:** D3.js (d3-sankey), Plotly
- **Interactive Level:** Hover + Drilldown

### Result 4
- **Data Type:** Real-Time Streaming
- **Keywords:** streaming, real-time, ticker, live, velocity, pulse, monitoring
- **Best Chart Type:** Streaming Area Chart
- **Secondary Options:** Ticker Tape, Moving Gauge
- **When to Use:** Live monitoring dashboards; IoT/ops data updating at ≥1 Hz; user needs current value at a glance
- **When NOT to Use:** Update frequency < 1/min (use periodic-refresh line chart); flashing content without reduced-motion support
- **Data Volume Threshold:** Canvas/WebGL required. Buffer last 60–300s of data. Downsample older data on scroll
- **Color Guidance:** Current pulse: #00FF00 (dark theme) or #0080FF (light theme). History: fading opacity. Grid: dark background
- **Accessibility Grade:** B
- **Accessibility Notes:** Pause/resume control required. Current value as large visible text KPI. Respect prefers-reduced-motion.
- **A11y Fallback:** Pause/resume button required; current value shown as large text KPI; prefers-reduced-motion: freeze animation
- **Library Recommendation:** Smoothed D3.js, CanvasJS
- **Interactive Level:** Real-time + Pause + Zoom

### Result 5
- **Data Type:** Correlation / Distribution
- **Keywords:** correlation, distribution, scatter, relationship, pattern, cluster
- **Best Chart Type:** Scatter Plot or Bubble Chart
- **Secondary Options:** Heat Map, Matrix
- **When to Use:** Exploring relationship between two continuous variables; identifying clusters or outliers in a dataset
- **When NOT to Use:** Variables are categorical (use grouped bar); fewer than 20 points (patterns aren't meaningful); mobile-primary context
- **Data Volume Threshold:** <500 pts: SVG; 500–5000: Canvas at 0.6–0.8 opacity; >5000: hexbin or aggregate first
- **Color Guidance:** Color axis: gradient (blue → red). Bubble size: relative to 3rd variable. Opacity: 0.6–0.8 to show density
- **Accessibility Grade:** B
- **Accessibility Notes:** Provide data table alternative. Combine color + shape distinction for colorblind users.
- **A11y Fallback:** Data table with correlation coefficient annotation; shape markers (circle/square/triangle) per group
- **Library Recommendation:** D3.js, Plotly, Recharts
- **Interactive Level:** Hover + Brush

### Result 6
- **Data Type:** Relationship / Connection Data
- **Keywords:** network, graph, nodes, edges, connections, relationships, force
- **Best Chart Type:** Network Graph
- **Secondary Options:** Hierarchical Tree, Adjacency Matrix
- **When to Use:** Mapping connections between entities; network topology or social graph exploration context
- **When NOT to Use:** Node count > 500 without clustering pre-applied; user needs precise connection counts; mobile context
- **Data Volume Threshold:** ≤100 nodes: SVG; 101–500: Canvas; >500: must apply clustering/LOD before rendering
- **Color Guidance:** Node types: categorical colors. Edges: #90A4AE at 60% opacity. Highlight path: #F59E0B
- **Accessibility Grade:** D
- **Accessibility Notes:** Fundamentally inaccessible without alternative. Never use as sole representation. Always provide list alternative.
- **A11y Fallback:** Adjacency list table (Node A → Node B → Weight); hierarchical tree view when structure allows
- **Library Recommendation:** D3.js (d3-force), Vis.js, Cytoscape.js
- **Interactive Level:** Drilldown + Hover + Drag
