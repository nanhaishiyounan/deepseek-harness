// Prompt that lets a visitor rebuild this app from scratch with their own
// coding agent. Derived from the live data model, pages and workflows of
// this portal, so it describes what the app actually is.
// English only - it is meant to be pasted into a coding agent.

export function buildReplicatePrompt() {
  return `Build an "All in one" app on NocoBase with your coding agent.

What it is: a broad back-office suite: sales pipeline, projects, HR, inventory, procurement, finance, helpdesk, assets and a knowledge base.

Data model (collection - purpose; key fields):
  hub_as_assets - assets
      fields: category (laptop|monitor|other|peripheral|phone), status (assigned|in_stock|repair|retired), name, tag, purchase_date, value
      relations: assignments -> hub_as_assignments, maintenance_records -> hub_as_maintenance
  hub_as_assignments - assignments
      fields: assigned_date, returned_date, assignee_id, asset_id, note
      relations: asset -> hub_as_assets, assignee -> users
  hub_as_maintenance - maintenance
      fields: type (Preventive|Corrective|Inspection), status (Scheduled|In progress|Done), completed_date, assetId, cost, notes, title, vendor, scheduled_date
      relations: asset -> hub_as_assets
  hub_fin_budgets - budgets
      fields: category (travel|meals|software|equipment|other), period, amount
  hub_fin_expenses - expenses
      fields: status (pending|approved|rejected|reimbursed), category (travel|meals|software|equipment|other), amount, spent_at, title
      relations: employee -> users
  hub_fin_invoice_items - line items of an invoice
      fields: amount, description, unit_price, quantity
      relations: invoice -> hub_fin_invoices
  hub_fin_invoices - invoices
      fields: status (draft|sent|paid|overdue), due_date, invoice_number, amount, issue_date, client_name
  hub_hr_departments - departments
      fields: name, parentId, code
      relations: parent -> hub_hr_departments, employees -> hub_hr_employees, children -> hub_hr_departments
  hub_hr_employees - employees
      fields: status (active|onleave|terminated), department_id, email, name, job_title, hire_date, manager_id
      relations: department -> hub_hr_departments, manager -> hub_hr_employees, reports -> hub_hr_employees, leave_requests -> hub_hr_leave_requests
  hub_hr_leave_requests - leave requests
      fields: status (pending|approved|rejected), type (annual|sick|unpaid), reason, employee_id, days, start_date, end_date
      relations: employee -> hub_hr_employees
  hub_inv_products - products
      fields: status (active|discontinued), category (electronics|office|parts|other), sku, reorder_level, unit_price, name
      relations: stock_moves -> hub_inv_stock_moves
  hub_inv_stock_moves - stock moves
      fields: type (in|out|adjust), qty, note, product_id, warehouse_id, moved_at
      relations: warehouse -> hub_inv_warehouses, product -> hub_inv_products
  hub_inv_warehouses - warehouses
      fields: location, name, code
      relations: stock_moves -> hub_inv_stock_moves
  hub_kb_article_feedback - thumbs up/down on an article
      fields: rating (helpful|not_helpful), author_id, comment, article_id
      relations: author -> users, article -> hub_kb_articles
  hub_kb_articles - articles
      fields: status (draft|published), body, views, author_id, summary, category_id, title
      relations: category -> hub_kb_categories, author -> users
  hub_kb_categories - categories
      fields: name, parent_id, description
      relations: parent -> hub_kb_categories, children -> hub_kb_categories
  hub_pj_checklist - checklist items under a task
      fields: title, done
      relations: task -> hub_pj_tasks
  hub_pj_milestones - milestones
      fields: done, name, due_date, hub_pj_ms_project_id
      relations: project -> hub_pj_projects
  hub_pj_projects - projects
      fields: status (active|done|on_hold|planning), hub_pj_project_owner_id, code, name, start_date, due_date
      relations: owner -> users
  hub_pj_tasks - tasks
      fields: priority (high|low|med), status (done|in_progress|review|todo), hub_pj_task_project_id, due_date, title, hub_pj_task_assignee_id
      relations: assignee -> users, project -> hub_pj_projects
  hub_po_items - line items of a purchase order
      fields: product_name, qty, unit_price, purchase_order_id
      relations: purchase_order -> hub_po_purchase_orders
  hub_po_purchase_orders - purchase orders
      fields: status (draft|sent|received|cancelled), total, po_number, owner_id, order_date, supplier_id
      relations: owner -> users, supplier -> hub_po_suppliers, items -> hub_po_items
  hub_po_suppliers - suppliers
      fields: status (active|inactive), contact_name, email, name, rating
      relations: purchase_orders -> hub_po_purchase_orders
  hub_sales_accounts - accounts
      fields: industry (technology|manufacturing|retail|finance|healthcare), name, owner_id, website
      relations: deals -> hub_sales_deals, owner -> users, contacts -> hub_sales_contacts
  hub_sales_activities - activities
      fields: type (call|email|meeting), date, subject, deal_id, notes
      relations: deal -> hub_sales_deals
  hub_sales_contacts - contacts
      fields: name, account_id, title, email, phone
      relations: account -> hub_sales_accounts
  hub_sales_deals - deals
      fields: stage (inquiry|quote|negotiation|won|lost), expected_close_date, title, account_id, owner_id, amount
      relations: activities -> hub_sales_activities, account -> hub_sales_accounts, owner -> users
  hub_sales_leads - leads
      fields: status (new|qualified|converted|unqualified), source (website|referral|event|cold_call|partner), company, name, owner_id, email, converted_account_id, converted_contact_id, converted_deal_id, converted_at, conversion_key
      relations: owner -> users, converted_account -> hub_sales_accounts, converted_contact -> hub_sales_contacts, converted_deal -> hub_sales_deals

Pages:
  /accounts, /activities, /articles, /asset-maintenance, /asset-registry, /assignments, /budget, /cash-flow, /categories, /contacts, /deals, /departments, /employees, /expenses, /faq, /finance, /forecast, /inventory, /invoices, /kb-overview, /kb-search, /kb-tags, /leads, /leave, /leave-calendar, /milestones, /my-tasks, /org-chart, /overview, /procurement-spend, /products, /project-calendar, /projects, /purchase-orders, /reorder, /sales-calendar, /sla-policies, /stock-moves, /suppliers, /tasks, /tickets, /warehouses
  Each resource page is a list with search/filter plus create, edit and detail dialogs.

Seed data: about 484 rows in total, e.g. hub_inv_stock_moves ~53, hub_fin_invoice_items ~44, hub_po_items ~41.
Keep every seeded value in English.

Build in this order: data model -> pages -> workflows -> roles/permissions -> seed data.
After each page, open it and confirm it renders and its create/edit dialogs work before moving on.`;
}
