-- Boardroom agents can now propose a Trendyol title/description change that the
-- owner approves to push live. Extend the agent_actions kind check accordingly.

alter table public.agent_actions
  drop constraint if exists agent_actions_kind_check;

alter table public.agent_actions
  add constraint agent_actions_kind_check
  check (kind in ('price', 'site_product', 'site_article', 'image', 'visibility', 'content'));
