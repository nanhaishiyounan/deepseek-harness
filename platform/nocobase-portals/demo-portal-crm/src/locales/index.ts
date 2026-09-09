import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import { starter as enUSStarter } from "./en-US";
import { starter as zhCNStarter } from "./zh-CN";
import { additionalTranslations } from "./generated";

registerTranslationResources("starter", {
  "en-US": enUSStarter,
  "zh-CN": zhCNStarter,
  ...(additionalTranslations["starter"] ?? {}),
});
