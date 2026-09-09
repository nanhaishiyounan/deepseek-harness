// Prompt that lets a visitor rebuild this app from scratch with their own
// coding agent. Derived from the live data model, pages and workflows of
// this portal, so it describes what the app actually is.
// English only - it is meant to be pasted into a coding agent.

export function buildReplicatePrompt() {
  return `Build a "CRM" app on NocoBase with your coding agent.

What it is: a sales CRM: leads convert to customers, deals move along a pipeline, quotes turn into orders, with follow-ups and per-owner targets.

Data model (collection - purpose; key fields):
  crm_activities - activities
      fields: type (call|email|meeting), customer_id, notes, dealId, contact_id, subject, date
      relations: customer -> crm_customers, deal -> crm_deals, contact -> crm_contacts
  crm_contacts - contacts
      fields: notes, phone, name, email, customer_id, job_title
      relations: activities -> crm_activities, deals -> crm_deals, customer -> crm_customers
  crm_customers - customers
      fields: status (active|inactive), notes, phone, website, company_name, ownerId, industry
      relations: activities -> crm_activities, deals -> crm_deals, quotes -> crm_quotes, follow_ups -> crm_follow_ups, owner -> users, contacts -> crm_contacts
  crm_deals - deals
      fields: stage (inquiry|lost|negotiation|quote|won), title, ownerId, expected_close_date, contact_id, customer_id, notes, amount, closed_date
      relations: contact -> crm_contacts, owner -> users, quotes -> crm_quotes, activities -> crm_activities, customer -> crm_customers
  crm_follow_ups - follow ups
      fields: status (done|pending), ownerId, subject, due_date, notes, dealId, customer_id
      relations: customer -> crm_customers, deal -> crm_deals, owner -> users
  crm_leads - leads
      fields: source (website|referral|event|outbound|partner), status (new|working|qualified|unqualified|converted), owner_id, phone, email, name, company, score
      relations: owner -> users
  crm_products - products
      fields: category (seating|tables|storage|accessories|services), name, sku, active, unit_price
      relations: quote_items -> crm_quote_items
  crm_quote_items - quote items
      fields: unit_price, product_name, product_id, quote_id, qty
      relations: product -> crm_products, quote -> crm_quotes
  crm_quotes - quotes
      fields: status (draft|sent|accepted|rejected), quote_number, valid_until, deal_id, issue_date, total, customer_id
      relations: customer -> crm_customers, items -> crm_quote_items, deal -> crm_deals
  crm_targets - targets
      fields: period, quota_amount, owner_id
      relations: owner -> users

Pages:
  /activities, /customers, /dashboard, /follow-ups, /leads, /pipeline, /products, /quotes, /reports, /targets
  Each resource page is a list with search/filter plus create, edit and detail dialogs.

Workflows:
  crm_ Activate customer and create onboarding task - on crm_deals change
  crm_ Remind owner after seven days without activity - on a schedule

Seed data: about 123 rows in total, e.g. crm_deals ~31, crm_quote_items ~25, crm_targets ~12.
Keep every seeded value in English.

Build in this order: data model -> pages -> workflows -> roles/permissions -> seed data.
After each page, open it and confirm it renders and its create/edit dialogs work before moving on.`;
}
