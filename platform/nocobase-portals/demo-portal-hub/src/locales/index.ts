import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import { starter as enUSStarter } from "./en-US";
import { starter as zhCNStarter } from "./zh-CN";
import { homeLocale } from "@/pages/home/locale";
import { salesLocale } from "@/pages/sales/locale";
import { projectsLocale } from "@/pages/projects/locale";
import { hrLocale } from "@/pages/hr/locale";
import { inventoryLocale } from "@/pages/inventory/locale";
import { procurementLocale } from "@/pages/procurement/locale";
import { helpdeskLocale } from "@/pages/helpdesk/locale";
import { assetsLocale } from "@/pages/assets/locale";
import { financeLocale } from "@/pages/finance/locale";
import { knowledgeLocale } from "@/pages/knowledge/locale";
import { additionalTranslations } from "./generated";

const mods = [homeLocale, salesLocale, projectsLocale, hrLocale, inventoryLocale, procurementLocale, helpdeskLocale, assetsLocale, financeLocale, knowledgeLocale];

const enUS = Object.assign({}, enUSStarter, ...mods.map((m) => m["en-US"]));
const zhCN = Object.assign({}, zhCNStarter, ...mods.map((m) => m["zh-CN"]));

registerTranslationResources("starter", {
  "en-US": enUS,
  "zh-CN": zhCN,
  ...(additionalTranslations["starter"] ?? {}),
});
