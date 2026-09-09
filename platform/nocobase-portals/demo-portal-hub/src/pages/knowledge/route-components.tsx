import { BookOpen, FolderTree, LibraryBig, Search, Tags } from "lucide-react";
import { useParams } from "react-router";
import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ArticleFeedback, FeedbackShow } from "@/pages/knowledge/articles/feedback";
import { ArticleCreate, ArticleEdit } from "@/pages/knowledge/articles/form";
import { ArticlesLayout } from "@/pages/knowledge/articles/list";
import { ArticleShow, ArticleShowDrawer } from "@/pages/knowledge/articles/show";
import { CategoryCreate, CategoryEdit } from "@/pages/knowledge/categories/form";
import { CategoriesLayout } from "@/pages/knowledge/categories/list";
import { CategoryShow } from "@/pages/knowledge/categories/show";
import { KnowledgeOverview } from "@/pages/knowledge/dashboard";
import { knowledgeRoutes } from "@/pages/knowledge/routes";
import { KnowledgeSearch } from "@/pages/knowledge/search";
import { KnowledgeTags } from "@/pages/knowledge/tags";

const denied = <AccessDenied />;

// --- Category-scoped article surfaces (inside the category detail drawer) ---

function CategoryScopedArticleCreate() {
  const { id } = useParams<{ id: string }>();
  return <ArticleCreate presetCategoryId={id} />;
}

function CategoryScopedArticleEdit() {
  const { id } = useParams<{ id: string }>();
  return <ArticleEdit presetCategoryId={id} idParam="articleId" />;
}

// --- Nested children of the article reader (show) route ---------------------

const articleShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_kb_articles.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_kb_articles" action="edit" fallback={denied}>
        <ArticleEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_kb_articles.show.feedback",
    path: "feedback",
    element: (
      <CanAccess resource="hub_kb_article_feedback" action="create" fallback={denied}>
        <ArticleFeedback />
      </CanAccess>
    ),
  },
  {
    // One level deeper: view a single feedback entry from the reader.
    name: "hub_kb_articles.show.feedback.view",
    path: "feedback/view/:feedbackId",
    element: (
      <CanAccess resource="hub_kb_article_feedback" action="show" fallback={denied}>
        <FeedbackShow />
      </CanAccess>
    ),
  },
];

// --- Nested children of the category detail (show) drawer ------------------

const categoryShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_kb_categories.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_kb_categories" action="edit" fallback={denied}>
        <CategoryEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_kb_categories.show.articles.create",
    path: "articles/create",
    element: (
      <CanAccess resource="hub_kb_articles" action="create" fallback={denied}>
        <CategoryScopedArticleCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_kb_categories.show.articles.edit",
    path: "articles/edit/:articleId",
    element: (
      <CanAccess resource="hub_kb_articles" action="edit" fallback={denied}>
        <CategoryScopedArticleEdit />
      </CanAccess>
    ),
  },
  {
    // One level deeper: open an article's SHOW drawer from the category.
    name: "hub_kb_categories.show.articles.show",
    path: "articles/show/:articleId",
    element: (
      <CanAccess resource="hub_kb_articles" action="show" fallback={denied}>
        <ArticleShowDrawer idParam="articleId" />
      </CanAccess>
    ),
  },
];

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "knowledge_overview",
    path: knowledgeRoutes.overview,
    element: <KnowledgeOverview />,
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
    element: <ArticlesLayout />,
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
        element: (
          <CanAccess resource="hub_kb_articles" action="create" fallback={denied}>
            <ArticleCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_kb_articles.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_kb_articles" action="edit" fallback={denied}>
            <ArticleEdit />
          </CanAccess>
        ),
      },
    ],
  },
  {
    // Reader (show) page — a standalone route, not a nav item.
    name: "hub_kb_articles.show",
    path: knowledgeRoutes.articlesShow,
    element: (
      <CanAccess resource="hub_kb_articles" action="show" fallback={denied}>
        <ArticleShow />
      </CanAccess>
    ),
    children: articleShowChildren,
  },
  {
    name: "kb-search",
    path: knowledgeRoutes.search,
    element: <KnowledgeSearch />,
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
    element: <KnowledgeTags />,
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
    element: <CategoriesLayout />,
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
        element: (
          <CanAccess resource="hub_kb_categories" action="create" fallback={denied}>
            <CategoryCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_kb_categories.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_kb_categories" action="edit" fallback={denied}>
            <CategoryEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_kb_categories.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_kb_categories" action="show" fallback={denied}>
            <CategoryShow />
          </CanAccess>
        ),
        children: categoryShowChildren,
      },
    ],
  },
]);

export const knowledgeModule = { routes };

type MaterializedRoute = {
  name?: string;
  element?: import("react").ReactNode;
  children?: MaterializedRoute[];
};

function findMaterializedRoute(
  routes: readonly MaterializedRoute[],
  name: string
): MaterializedRoute | undefined {
  for (const route of routes) {
    if (route.name === name) return route;
    const child = route.children
      ? findMaterializedRoute(route.children, name)
      : undefined;
    if (child) return child;
  }
  return undefined;
}

export function routeComponent(name: string) {
  const route = findMaterializedRoute(knowledgeModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
