const enUS = {
  // Nav / resources
  "helpdesk.resources.tickets": "Helpdesk",
  "helpdesk.resources.ticket": "Ticket",
  "helpdesk.resources.tickets.description":
    "Support tickets, priorities and the reply thread.",
  "helpdesk.resources.dashboard": "Workload",
  "helpdesk.resources.dashboard.description":
    "SLA health, queue workload and the priority mix.",
  "helpdesk.resources.agentPerformance": "Agent performance",
  "helpdesk.resources.agentPerformance.description":
    "Workload, response speed and SLA outcomes by agent.",
  "helpdesk.resources.slaPolicies": "SLA policies",
  "helpdesk.resources.slaPolicies.description":
    "Response and resolution targets by priority.",
  "helpdesk.resources.faq": "FAQ",
  "helpdesk.resources.faq.description":
    "Self-service answers to common IT and support questions.",

  // Common
  "helpdesk.common.unassigned": "Unassigned",

  // Enums — status
  "helpdesk.enums.status.open": "Open",
  "helpdesk.enums.status.pending": "Pending",
  "helpdesk.enums.status.resolved": "Resolved",
  "helpdesk.enums.status.closed": "Closed",

  // Enums — priority
  "helpdesk.enums.priority.low": "Low",
  "helpdesk.enums.priority.med": "Medium",
  "helpdesk.enums.priority.high": "High",
  "helpdesk.enums.priority.urgent": "Urgent",

  // Enums — category
  "helpdesk.enums.category.billing": "Billing",
  "helpdesk.enums.category.technical": "Technical",
  "helpdesk.enums.category.account": "Account",
  "helpdesk.enums.category.other": "Other",

  // Relative time
  "helpdesk.time.justNow": "just now",
  "helpdesk.time.minutes": "{{count}}m ago",
  "helpdesk.time.hours": "{{count}}h ago",
  "helpdesk.time.days": "{{count}}d ago",
  "helpdesk.time.months": "{{count}}mo ago",

  // Board / list
  "helpdesk.board.title": "Helpdesk",
  "helpdesk.board.subtitle":
    "Every support request from open to closed, with priorities, owners and the full reply thread.",
  "helpdesk.board.newTicket": "New ticket",
  "helpdesk.board.emptyColumn": "Nothing here",
  "helpdesk.board.untitled": "Untitled ticket",
  "helpdesk.board.boardHeading": "Board",
  "helpdesk.board.listHeading": "All tickets",
  "helpdesk.board.viewBoard": "Board",
  "helpdesk.board.viewList": "List",

  // List columns
  "helpdesk.list.columns.subject": "Ticket",
  "helpdesk.list.columns.status": "Status",
  "helpdesk.list.columns.priority": "Priority",
  "helpdesk.list.columns.requester": "Requester",
  "helpdesk.list.columns.assignee": "Assignee",
  "helpdesk.list.columns.updated": "Updated",
  "helpdesk.list.columns.actions": "Actions",

  // KPI tiles
  "helpdesk.kpi.open.label": "Open tickets",
  "helpdesk.kpi.open.hint": "Open + pending",
  "helpdesk.kpi.attention.label": "Needs attention",
  "helpdesk.kpi.attention.hint": "High / urgent, still open",
  "helpdesk.kpi.resolution.label": "Resolution rate",
  "helpdesk.kpi.resolution.hint": "{{count}} resolved / closed",
  "helpdesk.kpi.replies.label": "Total replies",
  "helpdesk.kpi.replies.hint": "Across all tickets",

  // Chart
  "helpdesk.chart.priority.title": "Open tickets by priority",
  "helpdesk.chart.priority.description":
    "Where the pressure sits right now across open and pending work.",

  // Detail / show
  "helpdesk.show.fallbackTitle": "Ticket",
  "helpdesk.show.description":
    "Full history of this support request, with the reply thread.",
  "helpdesk.show.editTicket": "Edit ticket",
  "helpdesk.show.changeStatus": "Change status",
  "helpdesk.show.errorTitle": "Unable to load ticket",
  "helpdesk.show.errorDescription":
    "The ticket may no longer exist, or you may not have permission to view it.",
  "helpdesk.show.noDescription": "No description provided.",
  "helpdesk.show.details": "Details",
  "helpdesk.show.opened": "Opened",
  "helpdesk.show.lastUpdated": "Last updated",
  "helpdesk.show.matchedSla": "Matched SLA",

  // Quick status-change (nested drawer)
  "helpdesk.status.title": "Change status",
  "helpdesk.status.description":
    "Move this ticket to a different stage in the queue.",
  "helpdesk.status.current": "Current status",
  "helpdesk.status.apply": "Set",
  "helpdesk.status.saving": "Updating...",

  // Dashboard
  "helpdesk.dashboard.title": "Workload & SLA",
  "helpdesk.dashboard.subtitle":
    "How healthy the queue is right now, who is carrying the load, and where priority sits.",
  "helpdesk.dashboard.kpi.health.label": "SLA health",
  "helpdesk.dashboard.kpi.health.sub": "Of {{count}} open tickets on track",
  "helpdesk.dashboard.kpi.atRisk.label": "At risk",
  "helpdesk.dashboard.kpi.atRisk.sub": "Past 70% of their SLA window",
  "helpdesk.dashboard.kpi.breached.label": "SLA breached",
  "helpdesk.dashboard.kpi.breached.sub": "Over the priority's response window",
  "helpdesk.dashboard.kpi.agents.label": "Agents with load",
  "helpdesk.dashboard.kpi.agents.sub": "Currently holding open tickets",
  "helpdesk.dashboard.queue.title": "Queue workload",
  "helpdesk.dashboard.queue.description":
    "Open + pending tickets currently sitting with each agent.",
  "helpdesk.dashboard.queue.empty": "Nothing in the queue.",
  "helpdesk.dashboard.priority.title": "Open tickets by priority",
  "helpdesk.dashboard.priority.description":
    "The priority mix of everything still open.",
  "helpdesk.dashboard.watchlist.title": "SLA watchlist",
  "helpdesk.dashboard.watchlist.description":
    "At-risk and breached tickets, most urgent first.",
  "helpdesk.dashboard.watchlist.empty": "Nothing at risk right now.",
  "helpdesk.dashboard.watchlist.breached": "Breached",
  "helpdesk.dashboard.watchlist.atRisk": "At risk",

  // Agent performance
  "helpdesk.agentPerformance.title": "Agent performance",
  "helpdesk.agentPerformance.description":
    "Compare workload, response speed, solve rate and SLA outcomes across the support team.",
  "helpdesk.agentPerformance.kpi.activeAgents": "Active agents",
  "helpdesk.agentPerformance.kpi.activeAgents.hint":
    "Agents holding open work",
  "helpdesk.agentPerformance.kpi.solveRate": "Team solve rate",
  "helpdesk.agentPerformance.kpi.solveRate.hint":
    "Resolved or closed tickets",
  "helpdesk.agentPerformance.kpi.slaAttainment": "Team SLA attainment",
  "helpdesk.agentPerformance.kpi.slaAttainment.hint":
    "Tickets completed within SLA",
  "helpdesk.agentPerformance.kpi.firstResponse": "Median first response",
  "helpdesk.agentPerformance.kpi.firstResponse.hint":
    "Across tickets with an agent reply",
  "helpdesk.agentPerformance.chart.open.title": "Open tickets by agent",
  "helpdesk.agentPerformance.chart.open.description":
    "The ten busiest queues by open and pending ticket count.",
  "helpdesk.agentPerformance.chart.mix.title": "Solved versus open",
  "helpdesk.agentPerformance.chart.mix.description":
    "Completed work compared with the current queue for the same agents.",
  "helpdesk.agentPerformance.chart.solved": "Solved",
  "helpdesk.agentPerformance.table.title": "Agent scorecard",
  "helpdesk.agentPerformance.table.description":
    "Rows with breached tickets are highlighted.",
  "helpdesk.agentPerformance.table.agent": "Agent",
  "helpdesk.agentPerformance.table.assigned": "Assigned",
  "helpdesk.agentPerformance.table.open": "Open",
  "helpdesk.agentPerformance.table.solved": "Solved",
  "helpdesk.agentPerformance.table.solveRate": "Solve rate",
  "helpdesk.agentPerformance.table.slaAttainment": "SLA attainment",
  "helpdesk.agentPerformance.table.breached": "Breached",
  "helpdesk.agentPerformance.table.replies": "Replies authored",
  "helpdesk.agentPerformance.table.firstResponse": "Avg. first response",
  "helpdesk.agentPerformance.noResponse": "—",
  "helpdesk.agentPerformance.empty.title": "No agent activity",
  "helpdesk.agentPerformance.empty.description":
    "Agent performance appears after tickets have been assigned.",

  // Field labels
  "helpdesk.fields.subject": "Subject",
  "helpdesk.fields.description": "Description",
  "helpdesk.fields.category": "Category",
  "helpdesk.fields.priority": "Priority",
  "helpdesk.fields.status": "Status",
  "helpdesk.fields.requester": "Requester",
  "helpdesk.fields.assignee": "Assignee",

  // Replies thread
  "helpdesk.thread.title": "Replies",
  "helpdesk.thread.count": "{{count}} messages",
  "helpdesk.thread.empty": "No replies yet. Start the conversation below.",
  "helpdesk.thread.placeholder": "Write a reply...",
  "helpdesk.thread.sending": "Sending...",
  "helpdesk.thread.send": "Send reply",

  // Reply edit (nested deeper drawer)
  "helpdesk.reply.edit": "Edit reply",
  "helpdesk.reply.drawer.edit.title": "Edit reply",
  "helpdesk.reply.drawer.edit.desc": "Update the text of this reply.",
  "helpdesk.reply.fields.body": "Reply",
  "helpdesk.reply.fields.body.required": "Reply text is required",
  "helpdesk.reply.actions.save": "Save reply",
  "helpdesk.reply.actions.saving": "Saving...",

  // Forms
  "helpdesk.form.create.title": "New ticket",
  "helpdesk.form.create.description":
    "Log a new support request and route it to an agent.",
  "helpdesk.form.create.submit": "Create ticket",
  "helpdesk.form.create.submitting": "Creating...",
  "helpdesk.form.edit.title": "Edit ticket",
  "helpdesk.form.edit.description":
    "Update the details, priority, status or assignment.",
  "helpdesk.form.edit.submit": "Save changes",
  "helpdesk.form.edit.submitting": "Saving...",
  "helpdesk.form.fields.subject.required": "Subject is required",
  "helpdesk.form.fields.subject.placeholder": "Short summary of the issue",
  "helpdesk.form.fields.description.placeholder":
    "Describe the problem, steps to reproduce, and impact",
  "helpdesk.form.fields.category.unspecified": "Unspecified",
  "helpdesk.form.fields.requester.placeholder": "Who raised this ticket?",
  "helpdesk.form.fields.assignee.placeholder": "Assign an agent",

  // SLA policies
  "helpdesk.sla.title": "SLA policies",
  "helpdesk.sla.subtitle":
    "Response and resolution targets for each priority level.",
  "helpdesk.sla.columns.name": "Policy",
  "helpdesk.sla.columns.priority": "Priority",
  "helpdesk.sla.columns.response": "Response target",
  "helpdesk.sla.columns.resolve": "Resolve target",
  "helpdesk.sla.columns.tickets": "Tickets",
  "helpdesk.sla.columns.breached": "Breached",
  "helpdesk.sla.columns.attainment": "Attainment %",
  "helpdesk.sla.attainment.label": "SLA attainment",
  "helpdesk.sla.kpi.policies": "Policies",
  "helpdesk.sla.kpi.covered": "Tickets covered",
  "helpdesk.sla.kpi.attainment": "Team attainment",
  "helpdesk.sla.kpi.breached": "Breached",
  "helpdesk.sla.uncovered.title": "SLA coverage gap",
  "helpdesk.sla.uncovered.description": "No SLA policy covers: {{priorities}}",
  "helpdesk.sla.export.name": "Name",
  "helpdesk.sla.export.priority": "Priority",
  "helpdesk.sla.export.response": "Response target (mins)",
  "helpdesk.sla.export.resolve": "Resolve target (mins)",
  "helpdesk.sla.minutes": "{{count}}m",
  "helpdesk.sla.hours": "{{count}}h",
  "helpdesk.sla.show.description":
    "Edit the response and resolution targets for this priority.",
  "helpdesk.sla.show.errorTitle": "Unable to load SLA policy",
  "helpdesk.sla.show.errorDescription":
    "The policy may no longer exist, or you may not have permission to view it.",
  "helpdesk.sla.fields.name": "Policy name",
  "helpdesk.sla.fields.priority": "Priority",
  "helpdesk.sla.fields.responseMins": "Response target (minutes)",
  "helpdesk.sla.fields.resolveMins": "Resolve target (minutes)",
  "helpdesk.sla.form.save": "Save changes",
  "helpdesk.sla.form.saving": "Saving...",
  "helpdesk.sla.form.saved": "Saved",
  "helpdesk.sla.new": "New policy",
  "helpdesk.sla.columns.actions": "Actions",
  "helpdesk.sla.create.title": "New SLA policy",
  "helpdesk.sla.create.description":
    "Define response and resolution targets for a priority level.",
  "helpdesk.sla.create.submit": "Create policy",
  "helpdesk.sla.create.submitting": "Creating...",

  // FAQ
  "helpdesk.faq.title": "Frequently asked questions",
  "helpdesk.faq.subtitle":
    "Quick answers to the questions the helpdesk sees most often.",
  "helpdesk.faq.search.placeholder": "Search questions and answers...",
  "helpdesk.faq.empty": "No questions match your search.",
  "helpdesk.faq.empty.description": "Try another search or category.",
  "helpdesk.faq.resultCount": "{{count}} results",
  "helpdesk.faq.categoryOther": "Other",
  "helpdesk.faq.filters.all": "All",
  "helpdesk.faq.kpi.articles": "Articles",
  "helpdesk.faq.kpi.categories": "Categories",
  "helpdesk.faq.kpi.uncategorised": "Uncategorised",
  "helpdesk.faq.export.question": "Question",
  "helpdesk.faq.export.answer": "Answer",
  "helpdesk.faq.export.category": "Category",
  "helpdesk.faq.new": "New question",
  "helpdesk.faq.edit": "Edit",
  "helpdesk.faq.delete": "Delete",
  "helpdesk.faq.create.title": "New question",
  "helpdesk.faq.create.description":
    "Add a self-service answer to the knowledge base.",
  "helpdesk.faq.create.submit": "Create question",
  "helpdesk.faq.create.submitting": "Creating...",
  "helpdesk.faq.edit.title": "Edit question",
  "helpdesk.faq.edit.description": "Update the question, answer or category.",
  "helpdesk.faq.edit.submit": "Save changes",
  "helpdesk.faq.edit.submitting": "Saving...",
  "helpdesk.faq.fields.question": "Question",
  "helpdesk.faq.fields.question.required": "Question is required",
  "helpdesk.faq.fields.question.placeholder": "e.g. How do I reset my password?",
  "helpdesk.faq.fields.answer": "Answer",
  "helpdesk.faq.fields.answer.required": "Answer is required",
  "helpdesk.faq.fields.answer.placeholder": "Write a clear, self-service answer.",
  "helpdesk.faq.fields.category": "Category",
  "helpdesk.faq.fields.category.placeholder": "e.g. Accounts",
  // --- Production list ops (toolbar, views, bulk, states) ---
  "helpdesk.ops.selectAll": "Select all",
  "helpdesk.ops.selectRow": "Select row",
  "helpdesk.ops.clearFilters": "Clear filters",
  "helpdesk.ops.saveView": "Save view",
  "helpdesk.ops.saveViewTitle": "Save current filters",
  "helpdesk.ops.saveViewPlaceholder": "View name",
  "helpdesk.ops.saveViewConfirm": "Save",
  "helpdesk.ops.density": "Row density",
  "helpdesk.ops.densityCompact": "Compact",
  "helpdesk.ops.densityComfortable": "Comfortable",
  "helpdesk.ops.columns": "Columns",
  "helpdesk.ops.columnsTitle": "Visible columns",
  "helpdesk.ops.columnsReset": "Reset columns",
  "helpdesk.ops.exportCsv": "Export CSV",
  "helpdesk.ops.exporting": "Exporting...",
  "helpdesk.ops.selected": "{{count}} selected",
  "helpdesk.ops.bulkDelete": "Delete",
  "helpdesk.ops.clearSelection": "Clear",
  "helpdesk.ops.error.title": "Something went wrong",
  "helpdesk.ops.error.description":
    "The data could not be loaded. Check your connection and try again.",
  "helpdesk.ops.error.retry": "Retry",
  "helpdesk.ops.empty.title": "Nothing here yet",

  // Agent queues
  "helpdesk.queues.all": "All",
  "helpdesk.queues.open": "Open",
  "helpdesk.queues.unassigned": "Unassigned",
  "helpdesk.queues.escalated": "High & urgent",
  "helpdesk.queues.solved": "Solved",

  // Bulk actions
  "helpdesk.bulk.assign": "Assign to",
  "helpdesk.bulk.assignResult": "{{count}} tickets reassigned",
  "helpdesk.bulk.setStatus": "Set status",
  "helpdesk.bulk.statusResult": "{{count}} tickets updated",

  // List columns
  "helpdesk.list.columns.sla": "SLA",
  "helpdesk.list.columns.category": "Category",
  "helpdesk.list.columns.age": "Age",

  // SLA countdown
  "helpdesk.sla.dueIn": "{{time}} left",
  "helpdesk.sla.breachedBy": "Breached {{time}}",
  "helpdesk.sla.closedMet": "Met",
  "helpdesk.sla.closedBreached": "Closed late",
  "helpdesk.sla.countdown": "Time to resolve",
  "helpdesk.sla.outcome": "SLA outcome",
  "helpdesk.sla.dueAt": "Target {{time}}",

  // Thread roles
  "helpdesk.thread.fromRequester": "Requester",
  "helpdesk.thread.fromAgent": "Agent",

  // Backlog ageing
  "helpdesk.kpi.breached.label": "SLA breached",
  "helpdesk.kpi.breached.hint": "Open work past its resolve target",
  "helpdesk.chart.aging.title": "Backlog ageing",
  "helpdesk.chart.aging.description":
    "How long the open queue has been waiting. A tail on the right means work is stalling.",
  "helpdesk.aging.bucket.d0": "< 1 day",
  "helpdesk.aging.bucket.d1": "1–3 days",
  "helpdesk.aging.bucket.d3": "3–7 days",
  "helpdesk.aging.bucket.d7": "1–2 weeks",
  "helpdesk.aging.bucket.d14": "2+ weeks",
};

const zhCN: Record<keyof typeof enUS, string> = {
  // Nav / resources
  "helpdesk.resources.tickets": "帮助台",
  "helpdesk.resources.ticket": "工单",
  "helpdesk.resources.tickets.description": "支持工单、优先级与回复记录。",
  "helpdesk.resources.dashboard": "工作负载",
  "helpdesk.resources.dashboard.description": "SLA 健康度、队列负载与优先级分布。",
  "helpdesk.resources.agentPerformance": "客服绩效",
  "helpdesk.resources.agentPerformance.description":
    "按客服查看工作量、响应速度与 SLA 结果。",
  "helpdesk.resources.slaPolicies": "SLA 策略",
  "helpdesk.resources.slaPolicies.description": "各优先级的响应与解决时限目标。",
  "helpdesk.resources.faq": "自助 FAQ",
  "helpdesk.resources.faq.description": "常见 IT 与支持问题的自助解答。",

  // Common
  "helpdesk.common.unassigned": "未分配",

  // Enums — status
  "helpdesk.enums.status.open": "待处理",
  "helpdesk.enums.status.pending": "处理中",
  "helpdesk.enums.status.resolved": "已解决",
  "helpdesk.enums.status.closed": "已关闭",

  // Enums — priority
  "helpdesk.enums.priority.low": "低",
  "helpdesk.enums.priority.med": "中",
  "helpdesk.enums.priority.high": "高",
  "helpdesk.enums.priority.urgent": "紧急",

  // Enums — category
  "helpdesk.enums.category.billing": "账单",
  "helpdesk.enums.category.technical": "技术",
  "helpdesk.enums.category.account": "账户",
  "helpdesk.enums.category.other": "其他",

  // Relative time
  "helpdesk.time.justNow": "刚刚",
  "helpdesk.time.minutes": "{{count}} 分钟前",
  "helpdesk.time.hours": "{{count}} 小时前",
  "helpdesk.time.days": "{{count}} 天前",
  "helpdesk.time.months": "{{count}} 个月前",

  // Board / list
  "helpdesk.board.title": "帮助台",
  "helpdesk.board.subtitle":
    "从创建到关闭的每一条支持请求，含优先级、负责人与完整回复记录。",
  "helpdesk.board.newTicket": "新建工单",
  "helpdesk.board.emptyColumn": "暂无工单",
  "helpdesk.board.untitled": "未命名工单",
  "helpdesk.board.boardHeading": "看板",
  "helpdesk.board.listHeading": "全部工单",
  "helpdesk.board.viewBoard": "看板",
  "helpdesk.board.viewList": "列表",

  // List columns
  "helpdesk.list.columns.subject": "工单",
  "helpdesk.list.columns.status": "状态",
  "helpdesk.list.columns.priority": "优先级",
  "helpdesk.list.columns.requester": "报告人",
  "helpdesk.list.columns.assignee": "处理人",
  "helpdesk.list.columns.updated": "最后更新",
  "helpdesk.list.columns.actions": "操作",

  // KPI tiles
  "helpdesk.kpi.open.label": "待处理工单",
  "helpdesk.kpi.open.hint": "待处理 + 处理中",
  "helpdesk.kpi.attention.label": "需要关注",
  "helpdesk.kpi.attention.hint": "高 / 紧急且尚未关闭",
  "helpdesk.kpi.resolution.label": "解决率",
  "helpdesk.kpi.resolution.hint": "{{count}} 项已解决 / 已关闭",
  "helpdesk.kpi.replies.label": "回复总数",
  "helpdesk.kpi.replies.hint": "所有工单合计",

  // Chart
  "helpdesk.chart.priority.title": "按优先级的待处理工单",
  "helpdesk.chart.priority.description":
    "当前待处理与处理中的工作压力集中在哪里。",

  // Detail / show
  "helpdesk.show.fallbackTitle": "工单",
  "helpdesk.show.description": "这条支持请求的完整记录，含回复往来。",
  "helpdesk.show.editTicket": "编辑工单",
  "helpdesk.show.changeStatus": "变更状态",
  "helpdesk.show.errorTitle": "无法加载工单",
  "helpdesk.show.errorDescription": "该工单可能已不存在，或你没有查看权限。",
  "helpdesk.show.noDescription": "未提供描述。",
  "helpdesk.show.details": "详细信息",
  "helpdesk.show.opened": "创建时间",
  "helpdesk.show.lastUpdated": "最后更新",
  "helpdesk.show.matchedSla": "匹配的 SLA",

  // Quick status-change (nested drawer)
  "helpdesk.status.title": "变更状态",
  "helpdesk.status.description": "将该工单移动到队列中的其他阶段。",
  "helpdesk.status.current": "当前状态",
  "helpdesk.status.apply": "设为此项",
  "helpdesk.status.saving": "更新中……",

  // Dashboard
  "helpdesk.dashboard.title": "工作负载与 SLA",
  "helpdesk.dashboard.subtitle": "队列当前的健康状况、谁承担了多少工作，以及优先级分布。",
  "helpdesk.dashboard.kpi.health.label": "SLA 健康度",
  "helpdesk.dashboard.kpi.health.sub": "{{count}} 项待处理工单中处于正常范围",
  "helpdesk.dashboard.kpi.atRisk.label": "有风险",
  "helpdesk.dashboard.kpi.atRisk.sub": "已超过 SLA 窗口的 70%",
  "helpdesk.dashboard.kpi.breached.label": "SLA 已超时",
  "helpdesk.dashboard.kpi.breached.sub": "已超出该优先级的响应时限",
  "helpdesk.dashboard.kpi.agents.label": "有负载的客服",
  "helpdesk.dashboard.kpi.agents.sub": "当前持有待处理工单",
  "helpdesk.dashboard.queue.title": "队列负载",
  "helpdesk.dashboard.queue.description": "当前每位客服名下的待处理 / 处理中工单数。",
  "helpdesk.dashboard.queue.empty": "队列中暂无工单。",
  "helpdesk.dashboard.priority.title": "按优先级的待处理工单",
  "helpdesk.dashboard.priority.description": "所有待处理工单的优先级分布。",
  "helpdesk.dashboard.watchlist.title": "SLA 关注列表",
  "helpdesk.dashboard.watchlist.description": "有风险与已超时的工单，最紧急的排在最前。",
  "helpdesk.dashboard.watchlist.empty": "目前没有有风险的工单。",
  "helpdesk.dashboard.watchlist.breached": "已超时",
  "helpdesk.dashboard.watchlist.atRisk": "有风险",

  // 客服绩效
  "helpdesk.agentPerformance.title": "客服绩效",
  "helpdesk.agentPerformance.description":
    "比较支持团队的工作量、响应速度、解决率与 SLA 结果。",
  "helpdesk.agentPerformance.kpi.activeAgents": "活跃客服",
  "helpdesk.agentPerformance.kpi.activeAgents.hint": "当前持有未关闭工单的客服",
  "helpdesk.agentPerformance.kpi.solveRate": "团队解决率",
  "helpdesk.agentPerformance.kpi.solveRate.hint": "已解决或已关闭的工单",
  "helpdesk.agentPerformance.kpi.slaAttainment": "团队 SLA 达标率",
  "helpdesk.agentPerformance.kpi.slaAttainment.hint": "在 SLA 时限内完成的工单",
  "helpdesk.agentPerformance.kpi.firstResponse": "首次响应中位数",
  "helpdesk.agentPerformance.kpi.firstResponse.hint": "基于已有客服回复的工单",
  "helpdesk.agentPerformance.chart.open.title": "各客服未关闭工单",
  "helpdesk.agentPerformance.chart.open.description":
    "按待处理与处理中工单数展示最繁忙的十个队列。",
  "helpdesk.agentPerformance.chart.mix.title": "已解决与未关闭对比",
  "helpdesk.agentPerformance.chart.mix.description":
    "比较同一组客服已完成的工作与当前队列。",
  "helpdesk.agentPerformance.chart.solved": "已解决",
  "helpdesk.agentPerformance.table.title": "客服绩效表",
  "helpdesk.agentPerformance.table.description": "存在 SLA 超时工单的行会被高亮。",
  "helpdesk.agentPerformance.table.agent": "客服",
  "helpdesk.agentPerformance.table.assigned": "已分配",
  "helpdesk.agentPerformance.table.open": "未关闭",
  "helpdesk.agentPerformance.table.solved": "已解决",
  "helpdesk.agentPerformance.table.solveRate": "解决率",
  "helpdesk.agentPerformance.table.slaAttainment": "SLA 达标率",
  "helpdesk.agentPerformance.table.breached": "已超时",
  "helpdesk.agentPerformance.table.replies": "已发送回复",
  "helpdesk.agentPerformance.table.firstResponse": "平均首次响应",
  "helpdesk.agentPerformance.noResponse": "—",
  "helpdesk.agentPerformance.empty.title": "暂无客服活动",
  "helpdesk.agentPerformance.empty.description": "分配工单后将显示客服绩效。",

  // Field labels
  "helpdesk.fields.subject": "主题",
  "helpdesk.fields.description": "描述",
  "helpdesk.fields.category": "分类",
  "helpdesk.fields.priority": "优先级",
  "helpdesk.fields.status": "状态",
  "helpdesk.fields.requester": "报告人",
  "helpdesk.fields.assignee": "处理人",

  // Replies thread
  "helpdesk.thread.title": "回复",
  "helpdesk.thread.count": "{{count}} 条消息",
  "helpdesk.thread.empty": "还没有回复。在下方开始对话吧。",
  "helpdesk.thread.placeholder": "写下回复……",
  "helpdesk.thread.sending": "发送中……",
  "helpdesk.thread.send": "发送回复",

  // Reply edit (nested deeper drawer)
  "helpdesk.reply.edit": "编辑回复",
  "helpdesk.reply.drawer.edit.title": "编辑回复",
  "helpdesk.reply.drawer.edit.desc": "修改这条回复的内容。",
  "helpdesk.reply.fields.body": "回复",
  "helpdesk.reply.fields.body.required": "回复内容为必填项",
  "helpdesk.reply.actions.save": "保存回复",
  "helpdesk.reply.actions.saving": "保存中……",

  // Forms
  "helpdesk.form.create.title": "新建工单",
  "helpdesk.form.create.description": "记录一条新的支持请求并分派给客服。",
  "helpdesk.form.create.submit": "创建工单",
  "helpdesk.form.create.submitting": "创建中……",
  "helpdesk.form.edit.title": "编辑工单",
  "helpdesk.form.edit.description": "更新详情、优先级、状态或指派。",
  "helpdesk.form.edit.submit": "保存更改",
  "helpdesk.form.edit.submitting": "保存中……",
  "helpdesk.form.fields.subject.required": "主题为必填项",
  "helpdesk.form.fields.subject.placeholder": "问题的简短概述",
  "helpdesk.form.fields.description.placeholder": "描述问题、复现步骤与影响",
  "helpdesk.form.fields.category.unspecified": "未指定",
  "helpdesk.form.fields.requester.placeholder": "谁提交了这条工单？",
  "helpdesk.form.fields.assignee.placeholder": "指派一位客服",

  // SLA policies
  "helpdesk.sla.title": "SLA 策略",
  "helpdesk.sla.subtitle": "每个优先级对应的响应与解决时限目标。",
  "helpdesk.sla.columns.name": "策略",
  "helpdesk.sla.columns.priority": "优先级",
  "helpdesk.sla.columns.response": "响应目标",
  "helpdesk.sla.columns.resolve": "解决目标",
  "helpdesk.sla.columns.tickets": "工单数",
  "helpdesk.sla.columns.breached": "已超时",
  "helpdesk.sla.columns.attainment": "达标率 %",
  "helpdesk.sla.attainment.label": "SLA 达标率",
  "helpdesk.sla.kpi.policies": "策略数",
  "helpdesk.sla.kpi.covered": "已覆盖工单",
  "helpdesk.sla.kpi.attainment": "团队达标率",
  "helpdesk.sla.kpi.breached": "已超时",
  "helpdesk.sla.uncovered.title": "SLA 覆盖缺口",
  "helpdesk.sla.uncovered.description": "以下优先级没有 SLA 策略：{{priorities}}",
  "helpdesk.sla.export.name": "名称",
  "helpdesk.sla.export.priority": "优先级",
  "helpdesk.sla.export.response": "响应目标（分钟）",
  "helpdesk.sla.export.resolve": "解决目标（分钟）",
  "helpdesk.sla.minutes": "{{count}} 分钟",
  "helpdesk.sla.hours": "{{count}} 小时",
  "helpdesk.sla.show.description": "编辑该优先级的响应与解决时限目标。",
  "helpdesk.sla.show.errorTitle": "无法加载 SLA 策略",
  "helpdesk.sla.show.errorDescription": "该策略可能已不存在，或你没有查看权限。",
  "helpdesk.sla.fields.name": "策略名称",
  "helpdesk.sla.fields.priority": "优先级",
  "helpdesk.sla.fields.responseMins": "响应目标（分钟）",
  "helpdesk.sla.fields.resolveMins": "解决目标（分钟）",
  "helpdesk.sla.form.save": "保存更改",
  "helpdesk.sla.form.saving": "保存中……",
  "helpdesk.sla.form.saved": "已保存",
  "helpdesk.sla.new": "新建策略",
  "helpdesk.sla.columns.actions": "操作",
  "helpdesk.sla.create.title": "新建 SLA 策略",
  "helpdesk.sla.create.description": "为某个优先级设定响应与解决时限目标。",
  "helpdesk.sla.create.submit": "创建策略",
  "helpdesk.sla.create.submitting": "创建中……",

  // FAQ
  "helpdesk.faq.title": "常见问题",
  "helpdesk.faq.subtitle": "帮助台最常被问到的问题与快速解答。",
  "helpdesk.faq.search.placeholder": "搜索问题或答案……",
  "helpdesk.faq.empty": "没有匹配的问题。",
  "helpdesk.faq.empty.description": "请尝试其他搜索词或分类。",
  "helpdesk.faq.resultCount": "{{count}} 条结果",
  "helpdesk.faq.categoryOther": "其他",
  "helpdesk.faq.filters.all": "全部",
  "helpdesk.faq.kpi.articles": "文章数",
  "helpdesk.faq.kpi.categories": "分类数",
  "helpdesk.faq.kpi.uncategorised": "未分类",
  "helpdesk.faq.export.question": "问题",
  "helpdesk.faq.export.answer": "答案",
  "helpdesk.faq.export.category": "分类",
  "helpdesk.faq.new": "新建问题",
  "helpdesk.faq.edit": "编辑",
  "helpdesk.faq.delete": "删除",
  "helpdesk.faq.create.title": "新建问题",
  "helpdesk.faq.create.description": "向知识库添加一条自助解答。",
  "helpdesk.faq.create.submit": "创建问题",
  "helpdesk.faq.create.submitting": "创建中……",
  "helpdesk.faq.edit.title": "编辑问题",
  "helpdesk.faq.edit.description": "更新问题、答案或分类。",
  "helpdesk.faq.edit.submit": "保存更改",
  "helpdesk.faq.edit.submitting": "保存中……",
  "helpdesk.faq.fields.question": "问题",
  "helpdesk.faq.fields.question.required": "问题为必填项",
  "helpdesk.faq.fields.question.placeholder": "例如：如何重置我的密码？",
  "helpdesk.faq.fields.answer": "答案",
  "helpdesk.faq.fields.answer.required": "答案为必填项",
  "helpdesk.faq.fields.answer.placeholder": "撰写清晰的自助解答。",
  "helpdesk.faq.fields.category": "分类",
  "helpdesk.faq.fields.category.placeholder": "例如：账户",
  // --- 生产级列表操作(工具条 / 视图 / 批量 / 三态) ---
  "helpdesk.ops.selectAll": "全选",
  "helpdesk.ops.selectRow": "选择本行",
  "helpdesk.ops.clearFilters": "清除筛选",
  "helpdesk.ops.saveView": "保存视图",
  "helpdesk.ops.saveViewTitle": "保存当前筛选",
  "helpdesk.ops.saveViewPlaceholder": "视图名称",
  "helpdesk.ops.saveViewConfirm": "保存",
  "helpdesk.ops.density": "行高",
  "helpdesk.ops.densityCompact": "紧凑",
  "helpdesk.ops.densityComfortable": "宽松",
  "helpdesk.ops.columns": "列",
  "helpdesk.ops.columnsTitle": "显示的列",
  "helpdesk.ops.columnsReset": "恢复默认列",
  "helpdesk.ops.exportCsv": "导出 CSV",
  "helpdesk.ops.exporting": "导出中...",
  "helpdesk.ops.selected": "已选择 {{count}} 条",
  "helpdesk.ops.bulkDelete": "删除",
  "helpdesk.ops.clearSelection": "取消选择",
  "helpdesk.ops.error.title": "出错了",
  "helpdesk.ops.error.description": "数据加载失败，请检查网络后重试。",
  "helpdesk.ops.error.retry": "重试",
  "helpdesk.ops.empty.title": "暂无内容",

  // 客服队列
  "helpdesk.queues.all": "全部",
  "helpdesk.queues.open": "未关闭",
  "helpdesk.queues.unassigned": "未指派",
  "helpdesk.queues.escalated": "高优/紧急",
  "helpdesk.queues.solved": "已解决",

  // 批量操作
  "helpdesk.bulk.assign": "指派给",
  "helpdesk.bulk.assignResult": "已重新指派 {{count}} 张工单",
  "helpdesk.bulk.setStatus": "设置状态",
  "helpdesk.bulk.statusResult": "已更新 {{count}} 张工单",

  // 列表列
  "helpdesk.list.columns.sla": "SLA",
  "helpdesk.list.columns.category": "分类",
  "helpdesk.list.columns.age": "已受理",

  // SLA 倒计时
  "helpdesk.sla.dueIn": "剩余 {{time}}",
  "helpdesk.sla.breachedBy": "已超时 {{time}}",
  "helpdesk.sla.closedMet": "达标",
  "helpdesk.sla.closedBreached": "超时关闭",
  "helpdesk.sla.countdown": "解决剩余时间",
  "helpdesk.sla.outcome": "SLA 结果",
  "helpdesk.sla.dueAt": "目标时间 {{time}}",

  // 对话角色
  "helpdesk.thread.fromRequester": "提单人",
  "helpdesk.thread.fromAgent": "客服",

  // 积压老化
  "helpdesk.kpi.breached.label": "SLA 超时",
  "helpdesk.kpi.breached.hint": "已超过解决时限的未关闭工单",
  "helpdesk.chart.aging.title": "积压老化",
  "helpdesk.chart.aging.description":
    "未关闭队列已经等了多久。右侧拖尾说明工单正在积压。",
  "helpdesk.aging.bucket.d0": "1 天内",
  "helpdesk.aging.bucket.d1": "1–3 天",
  "helpdesk.aging.bucket.d3": "3–7 天",
  "helpdesk.aging.bucket.d7": "1–2 周",
  "helpdesk.aging.bucket.d14": "2 周以上",
};

export const helpdeskLocale = {
  "en-US": enUS,
  "zh-CN": zhCN,
};
