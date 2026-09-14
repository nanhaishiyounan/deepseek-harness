import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import { starter as enUSStarter } from "./en-US";
import { starter as zhCNStarter } from "./zh-CN";
import { helpdeskLocale } from "@/pages/helpdesk/locale";
import { projectsLocale } from "@/pages/projects/locale";
import { hrLocale } from "@/pages/hr/locale";
import { additionalTranslations } from "./generated";

// Sidebar group labels for the migrated Hub domains (the CRM-native groups
// keep their crm.groups.* entries in the starter files below).
const groupLabels = {
  "en-US": {
    "groups.delivery": "Delivery",
    "groups.people": "People",
    "groups.operations": "Operations",
    "groups.finance": "Finance",
    "groups.support": "Support",
    "groups.knowledge": "Knowledge",
  },
  "zh-CN": {
    "groups.delivery": "交付",
    "groups.people": "人事",
    "groups.operations": "运营",
    "groups.finance": "财务",
    "groups.support": "支持",
    "groups.knowledge": "知识",
  },
} as const;

const mods = [helpdeskLocale, projectsLocale, hrLocale];

const enUS = Object.assign(
  {},
  enUSStarter,
  ...mods.map((m) => m["en-US"]),
  groupLabels["en-US"]
);
const zhCN = Object.assign(
  {},
  zhCNStarter,
  ...mods.map((m) => m["zh-CN"]),
  groupLabels["zh-CN"]
);

registerTranslationResources("starter", {
  "en-US": enUS,
  "zh-CN": zhCN,
  ...(additionalTranslations["starter"] ?? {}),
});
