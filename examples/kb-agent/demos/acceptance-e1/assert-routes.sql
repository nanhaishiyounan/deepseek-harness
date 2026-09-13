SELECT r.title, r.type, r."schemaUid" FROM "desktopRoutes" r WHERE r."parentId"=386332338028547 ORDER BY r.sort;
-- The E1 form AI buttons carry server-generated form uids (n18ai-<serverUid>),
-- not an n18ai-n17e1* prefix — the button namespace is all n18ai- mounts and
-- E1 owns the last three of the eleven (8 N17d pages + 3 E1 pages).
SELECT count(*) FILTER (WHERE uid LIKE 'n18ai-%') AS all_ai_buttons,        -- expect 11
       count(*) FILTER (WHERE uid LIKE 'n17e1%') AS e1_flow_models,        -- expect 84 while the three pages are kept whole
       count(*) FILTER (WHERE options->>'use' = 'RecordSelectFieldModel') AS m2o_edit_models,  -- expect 4 (owner + project ×2 + assignee)
       count(*) FILTER (WHERE options->>'use' = 'DateOnlyFieldModel') AS date_edit_models     -- expect 7 (3+3+1 popup date fields)
FROM "flowModels";
