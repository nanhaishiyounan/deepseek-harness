import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import enUS from "./en-US";
import zhCN from "./zh-CN";
import { additionalTranslations } from "./generated";

registerTranslationResources("nocobase-i18n", {
  "en-US": enUS,
  "zh-CN": zhCN,
  ...additionalTranslations,
});
