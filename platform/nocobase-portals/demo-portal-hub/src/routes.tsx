import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { homeModule } from "@/pages/home/module";
import { salesModule } from "@/pages/sales/module";
import { projectsModule } from "@/pages/projects/module";
import { hrModule } from "@/pages/hr/module";
import { inventoryModule } from "@/pages/inventory/module";
import { procurementModule } from "@/pages/procurement/module";
import { helpdeskModule } from "@/pages/helpdesk/module";
import { assetsModule } from "@/pages/assets/module";
import { financeModule } from "@/pages/finance/module";
import { knowledgeModule } from "@/pages/knowledge/module";

export const registryRoutesEnabled = false;

export const appRoutes = defineAppRoutes([
  ...homeModule.routes,
  ...salesModule.routes,
  ...projectsModule.routes,
  ...hrModule.routes,
  ...inventoryModule.routes,
  ...procurementModule.routes,
  ...helpdeskModule.routes,
  ...assetsModule.routes,
  ...financeModule.routes,
  ...knowledgeModule.routes,
]);
