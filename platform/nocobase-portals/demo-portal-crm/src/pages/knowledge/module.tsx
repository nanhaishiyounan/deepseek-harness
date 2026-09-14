import { BookOpen, FolderTree, LibraryBig, Search, Tags } from "lucide-react";
import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { knowledgeRoutes } from "@/pages/knowledge/routes";

// --- Nested children of the article reader (show) route ---------------------

const articleShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_kb_articles.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_articles.show.edit"),
      })),
  },
  {
    name: "hub_kb_articles.show.feedback",
    path: "feedback",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_articles.show.feedback"),
      })),
  },
  {
    // One level deeper: view a single feedback entry from the reader.
    name: "hub_kb_articles.show.feedback.view",
    path: "feedback/view/:feedbackId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_articles.show.feedback.view"),
      })),
  },
];

// --- Nested children of the category detail (show) drawer ------------------

const categoryShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_kb_categories.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_categories.show.edit"),
      })),
  },
  {
    name: "hub_kb_categories.show.articles.create",
    path: "articles/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_categories.show.articles.create"),
      })),
  },
  {
    name: "hub_kb_categories.show.articles.edit",
    path: "articles/edit/:articleId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_categories.show.articles.edit"),
      })),
  },
  {
    // One level deeper: open an article's SHOW drawer from the category.
    name: "hub_kb_categories.show.articles.show",
    path: "articles/show/:articleId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_categories.show.articles.show"),
      })),
  },
];

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "knowledge_overview",
    path: knowledgeRoutes.overview,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("knowledge_overview"),
      })),
    resource: {
      meta: {
        label: "KB Overview",
        i18nKey: "knowledge.resources.overview",
        i18nOptions: { ns: "starter" },
        priority: 30,
        icon: <LibraryBig />,
        acl: false,
      },
    },
  },
  {
    name: "hub_kb_articles",
    path: knowledgeRoutes.articles,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_articles"),
      })),
    resource: {
      meta: {
        label: "Articles",
        singularLabel: "Article",
        i18nKey: "knowledge.resources.articles",
        i18nSingularKey: "knowledge.resources.article",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "knowledge.resources.articles.description",
        priority: 10,
        icon: <BookOpen />,
        description: "Browse and search the knowledge base by category.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_kb_articles.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_kb_articles.create"),
          })),
      },
      {
        name: "hub_kb_articles.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_kb_articles.edit"),
          })),
      },
    ],
  },
  {
    // Reader (show) page — a standalone route, not a nav item.
    name: "hub_kb_articles.show",
    path: knowledgeRoutes.articlesShow,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_articles.show"),
      })),
    children: articleShowChildren,
  },
  {
    name: "kb-search",
    path: knowledgeRoutes.search,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("kb-search"),
      })),
    resource: {
      meta: {
        label: "Search",
        i18nKey: "knowledge.resources.search",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "knowledge.resources.search.description",
        priority: 50,
        icon: <Search />,
        description: "Search the knowledge base by title, summary, or body.",
        acl: false,
      },
    },
  },
  {
    name: "kb-tags",
    path: knowledgeRoutes.tags,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("kb-tags"),
      })),
    resource: {
      meta: {
        label: "Topics",
        i18nKey: "knowledge.resources.tags",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "knowledge.resources.tags.description",
        priority: 51,
        icon: <Tags />,
        description: "Browse articles grouped by topic.",
        acl: false,
      },
    },
  },
  {
    name: "hub_kb_categories",
    path: knowledgeRoutes.categories,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_kb_categories"),
      })),
    resource: {
      meta: {
        label: "Categories",
        singularLabel: "Category",
        i18nKey: "knowledge.resources.categories",
        i18nSingularKey: "knowledge.resources.category",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "knowledge.resources.categories.description",
        priority: 20,
        icon: <FolderTree />,
        description: "The topic tree that organizes every article.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_kb_categories.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_kb_categories.create"),
          })),
      },
      {
        name: "hub_kb_categories.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_kb_categories.edit"),
          })),
      },
      {
        name: "hub_kb_categories.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_kb_categories.show"),
          })),
        children: categoryShowChildren,
      },
    ],
  },
]);

export const knowledgeModule = { routes };
