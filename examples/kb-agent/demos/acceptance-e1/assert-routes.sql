SELECT r.title, r.type, r."schemaUid" FROM "desktopRoutes" r WHERE r."parentId"=386332338028547 ORDER BY r.sort;
SELECT count(*) FILTER (WHERE uid LIKE 'n18ai-n17e1%') AS e1_ai_buttons,
       count(*) FILTER (WHERE uid LIKE 'n17e1%') AS e1_flow_models,
       count(*) FILTER (WHERE options->>'use' = 'RecordSelectFieldModel') AS m2o_edit_models,
       count(*) FILTER (WHERE options->>'use' = 'DateOnlyFieldModel') AS date_edit_models
FROM "flowModels";
